import {
  FileText,
  HelpCircle,
  Home,
  LogOut,
  User,
  WalletCards,
  X,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { doCustomerLogout } from '../../../features/customer/customerApi';

const menuItems = [
  {
    label: 'Dashboard',
    path: '/customer/dashboard',
    icon: Home,
  },
  {
    label: 'My Application',
    path: '/customer/application',
    icon: FileText,
  },
  {
    label: 'Loan Details',
    path: '/customer/loan-details',
    icon: WalletCards,
  },
  {
    label: 'My Profile',
    path: '/customer/profile',
    icon: User,
  },
  {
    label: 'Help & Support',
    path: '/customer/support',
    icon: HelpCircle,
  },
];

function getStoredSession() {
  try {
    return JSON.parse(
      sessionStorage.getItem('customerSession') || 'null',
    );
  } catch {
    return null;
  }
}

export default function CustomerSidebar({ isOpen, onClose }) {
  const navigate = useNavigate();

  const session = getStoredSession();
  const mobileNumber = session?.mobileNumber || '';

  const maskedMobile = mobileNumber
    ? `+91 ${mobileNumber.slice(0, 2)}XXXX${mobileNumber.slice(-4)}`
    : 'Customer';

  const handleLogout = async () => {
    await doCustomerLogout();

    navigate('/customer/login', {
      replace: true,
    });
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="
            fixed
            inset-0
            z-40
            bg-slate-950/40
            backdrop-blur-[2px]
            lg:hidden
          "
        />
      )}

      <aside
        className={`
          fixed
          inset-y-0
          left-0
          z-50
          flex
          w-[260px]
          flex-col
          border-r
          border-slate-200
          bg-white
          transition-transform
          duration-300
          ease-out
          lg:translate-x-0
          ${
            isOpen
              ? 'translate-x-0'
              : '-translate-x-full'
          }
        `}
      >

        {/* =========================================
            LOGO
        ========================================= */}
        <div className="
          flex
          h-[76px]
          shrink-0
          items-center
          justify-between
          border-b
          border-slate-100
          px-5
        ">

          <button
            type="button"
            onClick={() =>
              navigate('/customer/dashboard')
            }
            className="
              flex
              h-full
              items-center
              outline-none
            "
          >
            <img
              src="/image/IMG_0007-removebg-preview.png"
              alt="FinLeaf"
              className="
                h-[58px]
                w-auto
                max-w-[145px]
                object-contain
              "
            />
          </button>

          {/* Mobile Close */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="
              flex
              h-9
              w-9
              items-center
              justify-center
              rounded-lg
              text-slate-400
              transition
              hover:bg-slate-100
              hover:text-slate-700
              lg:hidden
            "
          >
            <X size={19} />
          </button>
        </div>


        {/* =========================================
            NAVIGATION
        ========================================= */}
        <nav className="
          flex-1
          overflow-y-auto
          px-3
          py-6
        ">

          {/* Section label */}
          <div className="
            mb-3
            px-3
            text-[10px]
            font-bold
            uppercase
            tracking-[0.16em]
            text-slate-400
          ">
            Menu
          </div>

          <div className="space-y-1">

            {menuItems.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) => `
                    group
                    relative
                    flex
                    h-[48px]
                    items-center
                    gap-3
                    rounded-xl
                    px-3
                    text-[13px]
                    font-semibold
                    transition-all
                    duration-200

                    ${
                      isActive
                        ? `
                          bg-emerald-50
                          text-emerald-700
                        `
                        : `
                          text-slate-600
                          hover:bg-slate-50
                          hover:text-slate-900
                        `
                    }
                  `}
                >
                  {({ isActive }) => (
                    <>
                      {/* Active indicator */}
                      {isActive && (
                        <span className="
                          absolute
                          left-0
                          top-1/2
                          h-6
                          w-[3px]
                          -translate-y-1/2
                          rounded-r-full
                          bg-emerald-600
                        " />
                      )}

                      {/* Icon */}
                      <span
                        className={`
                          flex
                          h-9
                          w-9
                          shrink-0
                          items-center
                          justify-center
                          rounded-lg
                          transition-all
                          duration-200

                          ${
                            isActive
                              ? `
                                bg-white
                                text-emerald-600
                                shadow-sm
                                ring-1
                                ring-emerald-100
                              `
                              : `
                                bg-slate-50
                                text-slate-400
                                group-hover:bg-white
                                group-hover:text-slate-600
                              `
                          }
                        `}
                      >
                        <Icon size={17} strokeWidth={2} />
                      </span>

                      {/* Label */}
                      <span className="truncate">
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            })}

          </div>
        </nav>


        {/* =========================================
            BOTTOM ACCOUNT AREA
        ========================================= */}
        <div className="
          shrink-0
          border-t
          border-slate-100
          p-3
        ">

          {/* Customer information */}
          <div className="
            mb-2
            flex
            items-center
            gap-3
            rounded-xl
            px-3
            py-3
          ">

            {/* Avatar */}
            <div className="
              flex
              h-9
              w-9
              shrink-0
              items-center
              justify-center
              rounded-full
              bg-emerald-50
              text-emerald-600
            ">
              <User size={16} />
            </div>

            {/* Customer */}
            <div className="min-w-0">
              <p className="
                truncate
                text-[12px]
                font-bold
                text-slate-800
              ">
                Customer
              </p>

              <p className="
                mt-0.5
                truncate
                text-[10px]
                font-medium
                text-slate-400
              ">
                {maskedMobile}
              </p>
            </div>

            {/* Online indicator */}
            <span className="
              ml-auto
              h-2
              w-2
              shrink-0
              rounded-full
              bg-emerald-500
              ring-2
              ring-emerald-100
            " />
          </div>


          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="
              group
              flex
              h-[44px]
              w-full
              items-center
              gap-3
              rounded-xl
              px-3
              text-[13px]
              font-semibold
              text-slate-500
              transition-all
              duration-200
              hover:bg-red-50
              hover:text-red-600
            "
          >

            <span className="
              flex
              h-8
              w-8
              items-center
              justify-center
              rounded-lg
              bg-slate-50
              text-slate-400
              transition
              group-hover:bg-white
              group-hover:text-red-500
            ">
              <LogOut size={16} />
            </span>

            <span>
              Logout
            </span>

          </button>

        </div>
      </aside>
    </>
  );
}