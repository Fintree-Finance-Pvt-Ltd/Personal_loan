async function test() {
  const payload = {
    externalApplicationReference: 'TEST-APP-001',
    lan: 'TESTLAN123',
    sourceSystem: 'FINTREE_PLP',
    productCode: 'PL-STANDARD',
    customer: {
      fullName: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      fatherName: 'Richard Doe',
      panNumber: 'ABCDE1234F',
      dateOfBirth: '1990-01-01',
      gender: 'MALE',
      mobileNumber: '9876543210',
      email: 'john@example.com'
    },
    panVerification: {
      verified: true,
      providerReference: 'PAN-PROVIDER-REF',
      verifiedAt: '2026-08-01T00:00:00.000Z'
    }
  };

  console.log('Sending payload to Fintree LMS UAT:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch('https://uat.fintreelms.com/api/partner/v1/application', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'xai-sk-9K7mPqXvL2rT8wZfN4bH6jD9sQvdfsvsdfW3xY5tR8uP0oL2mN'
      },
      body: JSON.stringify(payload)
    });
    
    console.log('Status Code:', response.status);
    const data = await response.text();
    console.log('Response Body:', data);
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

test();
