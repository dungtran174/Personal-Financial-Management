import React, { useState } from 'react'
import { HiOutlineMenu, HiOutlineX } from 'react-icons/hi'
import SideMenu from './SideMenu'

const Navbar = ({ activeMenu }) => {
  const [openSideMenu, setOpenSideMenu] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  const handleToggleSideMenu = () => {
    if (openSideMenu) {
      setIsAnimating(false)
      setTimeout(() => setOpenSideMenu(false), 300) // Match transition duration
    } else {
      setOpenSideMenu(true)
      setTimeout(() => setIsAnimating(true), 10) // Small delay for animation to trigger
    }
  }

  return (
    <div className='flex gap-5 bg-white border border-b border-gray-200/50 backdrop-blur-[2px] py-4 px-4 sticky top-0 z-30 '>
      <button
      className={`text-black ${activeMenu == "Tin tức" ? 'block' : 'block lg:hidden'}`}
        onClick={handleToggleSideMenu}
      >
        {openSideMenu ? (
          <HiOutlineX className='text-2xl hover:cursor-pointer' />
        ) : (
          <HiOutlineMenu className='text-2xl hover:cursor-pointer' />
        )}
      </button>

      <h2 className='text-lg font-medium text-black'>Quản lý tài chính</h2>

      {openSideMenu && (
        <div className={`fixed top-[61px] left-0 transition-transform duration-600 ease-in-out ${
          isAnimating ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <SideMenu activeMenu={activeMenu} />
        </div>
      )}
    </div>
  )
}

export default Navbar
