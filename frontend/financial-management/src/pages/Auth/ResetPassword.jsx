import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthLayout from '../../components/layouts/AuthLayout';
import Input from '../../components/Inputs/Input';
import axiosInstance from '../../utils/axiosInstance';
import { API_PATHS } from '../../utils/apiPaths';
import { validatePassword } from '../../utils/helper';

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isValidToken, setIsValidToken] = useState(null); // null: loading, true: valid, false: invalid

  // Check token validity on mount
  useEffect(() => {
    const checkToken = async () => {
      try {
        await axiosInstance.get(`${API_PATHS.AUTH.RESET_PASSWORD}/${token}`);
        setIsValidToken(true);
      } catch (err) {
        setIsValidToken(false);
        setError("Đường dẫn đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
      }
    };
    checkToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    try {
      await axiosInstance.post(`${API_PATHS.AUTH.RESET_PASSWORD}/${token}`, { password });
      setSuccess(true);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra.');
    }
  };

  if (success) {
    return (
      <AuthLayout>
        <div className='lg:w-[70%] h-3/4 md:h-full flex flex-col justify-center items-center text-center'>
          <h3 className='text-xl font-semibold text-black mb-4'>Đổi mật khẩu thành công!</h3>
          <p className='text-slate-700 mb-6'>
            Mật khẩu của bạn đã được cập nhật. Vui lòng đăng nhập lại để tiếp tục sử dụng hệ thống.
          </p>
          <Link to="/login" className="btn-primary w-full block py-2">
            ĐĂNG NHẬP NGAY
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (isValidToken === false) {
    return (
      <AuthLayout>
        <div className='lg:w-[70%] h-3/4 md:h-full flex flex-col justify-center items-center text-center'>
          <h3 className='text-xl font-semibold text-red-500 mb-4'>Liên kết không hợp lệ</h3>
          <p className='text-slate-700 mb-6'>
            Đường dẫn đặt lại mật khẩu này không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu một liên kết mới.
          </p>
          <Link to="/forgot-password" className="btn-primary w-full block py-2">
            YÊU CẦU LẠI
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (isValidToken === null) {
    return (
      <AuthLayout>
        <div className='lg:w-[70%] h-3/4 md:h-full flex flex-col justify-center items-center'>
          <p>Đang kiểm tra...</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className='lg:w-[70%] h-3/4 md:h-full flex flex-col justify-center'>
        <h3 className='text-xl font-semibold text-black'>Đặt lại mật khẩu</h3>
        <form onSubmit={handleSubmit}>
          <Input
            value={password}
            onChange={({ target }) => setPassword(target.value)}
            label="Mật khẩu mới"
            type="password"
          />
          <Input
            value={confirmPassword}
            onChange={({ target }) => setConfirmPassword(target.value)}
            label="Xác nhận mật khẩu"
            type="password"
          />
          {error && <p className='text-red-500 text-xs pb-2.5'>{error}</p>}
          <button type="submit" className="btn-primary mt-4">ĐỔI MẬT KHẨU</button>
        </form>
      </div>
    </AuthLayout>
  );
};

export default ResetPassword;
