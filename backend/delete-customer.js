const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const customerId = 32n;

  try {
    console.log(`Locating applications for customer ${customerId}...`);
    const apps = await prisma.plApplication.findMany({
      where: { customerId }
    });

    const appIds = apps.map(a => a.id);

    if (appIds.length > 0) {
      console.log(`Found applications: ${appIds.join(', ')}. Deleting associated records...`);
      
      const appRefs = apps.map(a => a.applicationNumber).filter(Boolean);
      
      // Use Prisma's internal DMMF to find all models with an 'applicationId' field
      // and dynamically delete them to ensure we don't miss any foreign keys.
      const modelNames = Object.keys(prisma).filter(k => typeof k === 'string' && !k.startsWith('_') && !k.startsWith('$') && typeof prisma[k]?.deleteMany === 'function');

      for (const modelName of modelNames) {
        // Prisma models are camelCased on the client
        const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
        if (!prisma[delegateName] || !prisma[delegateName].deleteMany) continue;
        
        try {
          // If it has plApplicationId
          if (delegateName === 'partnerApplication') {
            await prisma[delegateName].deleteMany({ where: { plApplicationId: { in: appIds } } });
          }
          // If it has applicationReference
          else if (delegateName === 'mlmAllocationDecision') {
             if (appRefs.length > 0) {
               await prisma[delegateName].deleteMany({ where: { applicationReference: { in: appRefs } } });
             }
          }
          // Default: try to delete by applicationId
          else if (delegateName !== 'plApplication') {
             await prisma[delegateName].deleteMany({ where: { applicationId: { in: appIds } } });
          }
        } catch (e) {
           // Ignore errors if the field doesn't exist
        }
      }
      
      // Clear latestApplicationId on Customer to remove cyclic dependency
      await prisma.customer.updateMany({ where: { id: customerId }, data: { latestApplicationId: null } });

      // Delete Applications
      await prisma.plApplication.deleteMany({ where: { id: { in: appIds } } });
    }

    // Delete customer sessions
    const sessions = await prisma.customerSession.findMany({ where: { customerId } });
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length > 0) {
      await prisma.customerRefreshToken.updateMany({ where: { sessionId: { in: sessionIds } }, data: { parentTokenId: null } });
      await prisma.customerRefreshToken.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.customerSession.deleteMany({ where: { id: { in: sessionIds } } });
    }

    // Delete Customer
    await prisma.customer.delete({ where: { id: customerId } });
    console.log(`Customer ${customerId} and all associated data have been successfully deleted.`);

  } catch (error) {
    if (error.code === 'P2025') {
      console.log(`Customer ${customerId} not found.`);
    } else {
      console.error('Error deleting customer:', error);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
