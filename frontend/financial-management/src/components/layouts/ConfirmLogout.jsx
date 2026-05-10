import React from 'react'
import Modal from '../Modal'

const ConfirmLogout = ({isOpen, onClose, onConfirm}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Xác nhận đăng xuất">
      <div className='text-center py-4'>
        <p className='text-lg light:text-gray-700 dark:text-white mb-6'>
          Bạn có chắc chắn muốn đăng xuất không?
        </p>
        <div className='flex gap-4 justify-center'>
          <button
            onClick={onClose}
            className='px-6 py-2 bg-primary text-white rounded-lg hover:bg-purple-500 font-medium'
          >
            Không
          </button>
          <button
            onClick={onConfirm}
            className='px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium'
          >
            Có
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default ConfirmLogout
