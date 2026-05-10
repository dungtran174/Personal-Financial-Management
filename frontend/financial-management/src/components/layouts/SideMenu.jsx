import React, { useContext, useState } from 'react'
import { SIDE_MENU_DATA } from '../../utils/data'
import { UserContext } from '../../context/UserContext'
import { useNavigate } from 'react-router-dom'
import ConfirmLogout from './ConfirmLogout'


const   SideMenu = ({activeMenu}) => {
    const {user, clearUser} = useContext(UserContext);
    const navigate = useNavigate();
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    const handleClick = (route)=>{
        if(route === 'logout'){
            setShowLogoutModal(true);
            return;
        }
        navigate(route);
    }
    const handleLogout = ()=>{
        localStorage.clear();
        clearUser();
        navigate("/login");
        setShowLogoutModal(false);
    }
  return (
  <div className='w-64 h-[calc(100vh-61px)] bg-white border-r border-gray-200/50 p-5 sticky top-[61px] z-20 shadow-2xl'>
    <div className='flex flex-col items-center mb-7 mt-3 gap-3 justify-center'>
      <h5 className='text-gray-950 text-xl font-semibold leading-6'>{user?.fullName || ""}</h5>
    </div>

    {SIDE_MENU_DATA.map((item, index) => (
      <button
        key={`menu_${index}`}
        className={`w-full flex items-center gap-4 text-[15px] font-medium ${
          activeMenu === item.label ? "text-white bg-primary" : ""
        } py-3 px-6 rounded-lg mb-3`}
        onClick={() => handleClick(item.path)}
      >
        <i className={`${item.icon} text-xl`} ></i>
        {item.label}
      </button>
    ))}                                           
    
    <ConfirmLogout
      isOpen={showLogoutModal}
      onClose={() => setShowLogoutModal(false)}
      onConfirm={handleLogout}
    />
  </div>
)

}

export default SideMenu
