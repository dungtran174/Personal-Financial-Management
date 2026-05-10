import React, { useState } from 'react';
import AuthLayout from '../../components/layouts/AuthLayout';
import Input from '../../components/Inputs/Input';
import axiosInstance from '../../utils/axiosInstance';
import { API_PATHS } from '../../utils/apiPaths';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axiosInstance.post(API_PATHS.AUTH.FORGOT_PASSWORD, { email });
      setMessage('Vui lòng kiểm tra email của bạn để đặt lại mật khẩu.');
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra.');
      setMessage('');
    }
  };

  return (
    <AuthLayout>
      <div className='lg:w-[70%] h-3/4 md:h-full flex flex-col justify-center'>
        <h3 className='text-xl font-semibold text-black'>Quên mật khẩu</h3>
        <p className='text-xs text-slate-700 mt-[5px] mb-6'>
          Nhập email để nhận liên kết đặt lại mật khẩu.
        </p>
        <form onSubmit={handleSubmit}>
          <Input
            value={email}
            onChange={({ target }) => setEmail(target.value)}
            label="Địa chỉ Email"
            placeholder="Nhập email của bạn"
            type="text"
          />
          {message && <p className='text-green-500 text-xs pb-2.5'>{message}</p>}
          {error && <p className='text-red-500 text-xs pb-2.5'>{error}</p>}
          <button type="submit" className="btn-primary mt-4">GỬI YÊU CẦU</button>
        </form>
      </div>
    </AuthLayout>
  );
};

export default ForgotPassword;
