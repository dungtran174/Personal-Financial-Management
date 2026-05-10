import React, {useContext, useState } from 'react'
import AuthLayout from '../../components/layouts/AuthLayout'
import { Link, useNavigate } from 'react-router-dom'
import Input from '../../components/Inputs/Input'
import { validateEmail, validatePassword } from '../../utils/helper'
import axiosInstance from '../../utils/axiosInstance'
import { API_PATHS } from '../../utils/apiPaths'
import { UserContext } from '../../context/UserContext'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const {updateUser} = useContext(UserContext);

// Handle form submission
const handleLogin = async (e) => {
  e.preventDefault();

  if(!validateEmail(email)){
    setError('Vui lòng nhập địa chỉ email hợp lệ');
    return;
  }
  if(validatePassword(password)){
    setError(validatePassword(password));
    return;
  }

  setError("")

  // Login API call
  try {
    const response = await axiosInstance.post(API_PATHS.AUTH.LOGIN, {
      email,
      password,
    });
    
    const { token, user } = response.data;
    console.log(user);
    if (token) {
      localStorage.setItem("token", token);
      updateUser(user);
      navigate("/dashboard");
    }
  } catch (error) {
    if (error.response && error.response.data.message) {
      setError(error.response.data.message);
    } else {
      setError("Đã xảy ra lỗi. Vui lòng thử lại.");
    }
  }
}
  return (
    <AuthLayout>
      <div className='lg:w-[70%] h-3/4 md:h-full flex flex-col justify-center'>
        <h3 className='text-xl font-semibold text-black'>
          Chào mừng trở lại!
        </h3>
        <p className='text-xs text-slate-700 mt-[5px] mb-6'>
          Vui lòng nhập thông tin của bạn để đăng nhập
        </p>

        <form onSubmit={handleLogin}>
          <Input
            value = {email}
            onChange = {({target}) => setEmail(target.value)}
            label = "Địa chỉ Email"
            placeholder = "Nhập email của bạn"
            type = "text"
          ></Input>
          <Input
            value = {password}
            onChange = {({target}) => setPassword(target.value)}
            label = "Mật khẩu"
            placeholder = "Nhập mật khẩu của bạn"
            type = "password"
          ></Input>

          <div className="flex justify-end mb-4">
            <Link to="/forgot-password" className="text-sm text-primary underline">
              Quên mật khẩu?
            </Link>
          </div>

          {error && <p className='text-red-500 text-xs pb-2.5'>{error}</p>}

          <button type = "submit" className = "btn-primary">ĐĂNG NHẬP</button>
          <p className='text-[13px] text-slate-800 mt-3'>
            Bạn chưa có tài khoản?{" "}
            <Link className='text-primary font-medium cursor-pointer underline' to="/signup" >Đăng ký</Link>
          </p>
        </form>
      </div>
    </AuthLayout>
  )
}

export default Login
