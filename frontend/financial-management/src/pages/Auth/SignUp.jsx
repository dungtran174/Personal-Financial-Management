import React, {useContext, useState} from 'react'
import AuthLayout from '../../components/layouts/AuthLayout'
import { Link } from 'react-router-dom'
import Input from '../../components/Inputs/Input'
import { validateEmail, validatePassword } from '../../utils/helper'
import axiosInstance from '../../utils/axiosInstance'
import { API_PATHS } from '../../utils/apiPaths'
import { UserContext } from '../../context/UserContext'
import { useNavigate } from 'react-router-dom'
const SignUp = () => {
  const [profilePic, setProfilePic] = useState(null)
  const [fullName, setFullName] = useState()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const [error, setError] = useState('')

  const {updateUser} = useContext(UserContext);

  // Handle Sign Up Form Submit
  const handleSignUp = async(e)=>{
    e.preventDefault()

    if(!fullName){
      setError("Vui lòng nhập họ và tên của bạn");
      return;
    }
    if(!validateEmail(email)){
      setError('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }
    if(validatePassword(password)){
      setError(validatePassword(password));
      return;
    }
  
    setError("")

    // SignUp API Call
  try {
    console.log(fullName, email, password);
    const response = await axiosInstance.post(API_PATHS.AUTH.REGISTER, {
      fullName,
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
      <div className = "lg:w-[100%] h-auto md:h-full mt-10 md:mt-0 flex flex-col justify-center">
        <h3 className='text-xl font-semibold text-black'>
          Tạo tài khoản
        </h3>
        <p className='text-xs text-slate-700 mt-[5px] mb-6'>
          Tham gia với chúng tôi bằng cách nhập thông tin của bạn bên dưới.
        </p>
        <form onSubmit={handleSignUp}>
          <div className='grid gird-cols-1 md:grid-cols-2 gap-4'>
            <Input
              value = {fullName}
              onChange = {({target}) => setFullName(target.value)}
              label = "Họ và tên"
              placeholder = "Nhập họ và tên của bạn"
              type = "text"
            ></Input>
            <Input
              value = {email}
              onChange = {({target}) => setEmail(target.value)}
              label = "Địa chỉ Email"
              placeholder = "Nhập email của bạn"
              type = "text"
            ></Input>

            <div className = "col-span-2">
              <Input
                value = {password}
                onChange = {({target}) => setPassword(target.value)}
                label = "Mật khẩu"
                placeholder = "Nhập mật khẩu của bạn"
                type = "password"
              ></Input>
            </div>
          </div>
          {error && <p className='text-red-500 text-xs pb-2.5'>{error}</p>}
          
          <button type = "submit" className = "btn-primary">ĐĂNG KÝ</button>
          <p className='text-[13px] text-slate-800 mt-3'>
            Bạn đã có tài khoản?{" "}
            <Link className='text-primary font-medium cursor-pointer underline' to="/login" >Đăng nhập</Link>
          </p>
        </form>
      </div>
    </AuthLayout>
  )
}

export default SignUp
