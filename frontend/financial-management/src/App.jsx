import { BrowserRouter as Router, Routes, Route, Navigate  } from 'react-router-dom'
import React from 'react'
import SignUp from './pages/Auth/SignUp'
import Home from './pages/Dashboard/Home'
import Login from './pages/Auth/Login'
import ForgotPassword from './pages/Auth/ForgotPassword'
import ResetPassword from './pages/Auth/ResetPassword'
import Income from './pages/Dashboard/Income'
import Expense from './pages/Dashboard/Expense'
import UserProvider from './context/UserContext'
import "@fortawesome/fontawesome-free/css/all.min.css";
import {Toaster} from "react-hot-toast"
import News from './pages/Dashboard/News'

function App() {
  return (
    <UserProvider>
      <div>
        <Router>
          <Routes>
            <Route path='/' element={<Root />} />
            <Route path='/login' element={<Login />} />
            <Route path='/signUp' element={<SignUp />} />
            <Route path='/forgot-password' element={<ForgotPassword />} />
            <Route path='/reset-password/:token' element={<ResetPassword />} />
            <Route path='/income' element={<Income />} />
            <Route path='/expense' element={<Expense />} />
            <Route path='/news' element={<News />} />
            <Route path='/dashboard' element={<Home />} />
            <Route path='/news' element={<News />} />
          </Routes>
        </Router>
      </div>

      <Toaster
        toastOptions={{
          className: "",
          style: {
            fontSize: "13px"
          }
        }}
      />
    </UserProvider>
  )
}

export default App;

const Root = () => {
  // check if token exists in localstorage
  const isAuthenticated = !!localStorage.getItem('token');

  // Redirection to dashboard if token exists else to login
  return isAuthenticated ? (
    <Navigate to= "/dashboard" />
  ) : (
    <Navigate to= "/login" /> 
  )
}