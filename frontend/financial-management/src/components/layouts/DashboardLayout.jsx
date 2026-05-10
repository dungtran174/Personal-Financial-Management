import React, { useContext, useState } from 'react'
import {UserContext} from '../../context/UserContext'
import Navbar from "./Navbar";
import SideMenu from './SideMenu';
import { MessageCircle, X } from 'lucide-react';
import EnhancedChatPanel from '../EnhancedChatPanel';

const DashBoardLayout = ({children, activeMenu}) => {
  const { user } = useContext(UserContext)
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className = "">
      <Navbar activeMenu={activeMenu}></Navbar>
      {user && (
        <div className ="flex">
            {activeMenu !== "Tin tức" && (
              <div className = "max-[1024px]:hidden">
                  <SideMenu activeMenu={activeMenu}></SideMenu>
              </div>
            )}
            <div className='grow mx-5'>{children}</div>
        </div>
      )}

      {/* Global Chatbot UI */}
      {isChatOpen && (
        <div className="fixed bottom-20 sm:bottom-6 right-3 sm:right-6 z-40">
          <EnhancedChatPanel onClose={() => setIsChatOpen(false)} />
        </div>
      )}
      <button
        aria-label={isChatOpen ? 'Đóng chatbot' : 'Mở chatbot'}
        onClick={() => setIsChatOpen(prev => !prev)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#875cf5] text-white shadow-xl hover:bg-[#7049d0] transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#875cf5]"
      >
        {isChatOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </div>
  )
}

export default DashBoardLayout
