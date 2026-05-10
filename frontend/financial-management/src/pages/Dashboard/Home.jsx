import React, { useEffect, useState } from 'react'
import DashBoardLayout from '../../components/layouts/DashboardLayout'
import { useUserAuth } from '../../hooks/useUserAuth';
import axiosInstance from '../../utils/axiosInstance';
import { API_PATHS } from '../../utils/apiPaths';
import { useNavigate } from 'react-router-dom'; 
import InfoCard from '../../components/Cards/InfoCard';
import { addThousandsSeperator } from '../../utils/helper';
import RecentTransactions from '../../components/Dashboard/RecentTransactions';
import FinanceOverview from '../../components/Dashboard/FinanceOverview';
import ExpenseTransactions from '../../components/Dashboard/ExpenseTransactions';
import Last30DaysExpenses from '../../components/Dashboard/Last30DaysExpenses';
import RecentIncomeWithChart from '../../components/Dashboard/RecentIncomeWithChart';
import RecentIncome from '../../components/Dashboard/RecentIncome';
import IncomeExpenseCorrelation from '../../components/Dashboard/IncomeExpenseCorrelation';
import SearchCard from '../../components/Cards/SearchCard';
import toast from 'react-hot-toast';

const Home = () => {
  useUserAuth();

  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState(null); // Track selected date range

  const fetchDashboardData = async () => {
    if(loading) {
      return;
    }
    setLoading(true);

    try{
      const response = await axiosInstance.get(`${API_PATHS.DASHBOARD.GET_DATA}`)
      if (response.data){
        setDashboardData(response.data);
        setDateRange(null); // Reset date range when loading default data
        console.log("Dashboard data", response.data);
      }  
    } catch (error) {
      console.log("Someting went wrong. Please try again later.", error);
    } finally {
      setLoading(false);
    }
  }

  const handleReset = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get(`${API_PATHS.DASHBOARD.GET_DATA}`);
      if (response.data) {
        setDashboardData(response.data);
        setDateRange(null);
        console.log("Dashboard data reset:", response.data);
        toast.success("Đã đặt lại dữ liệu về 30 ngày gần nhất");
      }
    } catch (error) {
      console.log("Something went wrong. Please try again later.", error);
      toast.error("Không thể đặt lại dữ liệu. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (startDate, endDate) => {
    // Validation
    if (!startDate || !endDate) {
      toast.error("Vui lòng nhập đầy đủ thời gian");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      toast.error("Ngày bắt đầu phải nhỏ hơn ngày kết thúc");
      return;
    }

    // Fetch data by time range
    setLoading(true);

    try{
      const response = await axiosInstance.get(`${API_PATHS.DASHBOARD.GET_DATA_BY_TIME}`, {
        params: {
          startDate,
          endDate
        }
      });
      
      if (response.data){
        setDashboardData(response.data);
        console.log("Dashboard data by time range:", response.data);
        toast.success(`Đã tải dữ liệu từ ${startDate} đến ${endDate}`);
      }  
    } catch (error) {
      console.log("Something went wrong. Please try again later.", error);
      toast.error("Không thể tải dữ liệu. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboardData();
    return () => {}
  }, []);
  return (
    <DashBoardLayout activeMenu="Trang chủ">
      <div className='my-5 mx-auto'>
        <SearchCard onSearch={handleSearch} onReset={handleReset} />
        <div className = "grid grid-cols-1 md:grid-cols-3 gap-6">
          <InfoCard
            icon = "fa-regular fa-window-maximize"
            label = "Tổng số dư"
            value = {addThousandsSeperator(dashboardData?.totalBalance || 0)}
            color = "bg-primary">
          </InfoCard> 

          <InfoCard
            icon = "fa-solid fa-wallet"
            label = "Tổng thu nhập"
            value = {addThousandsSeperator(dashboardData?.totalIncome|| 0)}
            color = "bg-orange-500">
          </InfoCard> 

          <InfoCard
            icon = "fa-solid fa-hand-holding-dollar"
            label = "Tổng chi tiêu"
            value = {addThousandsSeperator(dashboardData?.totalExpenses || 0)}
            color = "bg-red-500">
          </InfoCard> 
        </div>

        <IncomeExpenseCorrelation
          dataIncome = {dashboardData?.rangeIncome?.transactions || dashboardData?.last30DaysIncome?.transactions||[]}
          dataExpense = {dashboardData?.rangeExpenses?.transactions || dashboardData?.last30DaysExpenses?.transactions || []}
        />

        <div className = "grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <RecentTransactions
            transactions={dashboardData?.recentTransactions}
            onSeeMore={() => navigate('/expense')}
          />

          <FinanceOverview
            totalBalance = {dashboardData?.totalBalance || 0}
            totalIncome = {dashboardData?.totalIncome || 0}
            totalExpense = {dashboardData?.totalExpenses || 0}
          />

          <ExpenseTransactions
            transactions={dashboardData?.rangeExpenses?.transactions || dashboardData?.last30DaysExpenses?.transactions||[]}
            onSeeMore={()=>{navigate("/expense")}}
          />

          <Last30DaysExpenses
            data = {dashboardData?.rangeExpenses?.transactions || dashboardData?.last30DaysExpenses?.transactions || []}
          />

          <RecentIncomeWithChart
            data={dashboardData?.rangeIncome?.transactions || dashboardData?.last30DaysIncome?.transactions||[]}
            totalIncome = {dashboardData?.rangeIncome?.total || dashboardData?.last30DaysIncome?.total || 0}
          />

          <RecentIncome
            transactions={dashboardData?.rangeIncome?.transactions || dashboardData?.last30DaysIncome?.transactions||[]}
            onSeeMore={()=>{navigate("/income")}} 
          />
        </div>

      </div>
    </DashBoardLayout>
  )
}

export default Home
