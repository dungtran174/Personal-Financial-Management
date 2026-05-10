import React, { useEffect, useState } from 'react'
import DashBoardLayout from '../../components/layouts/DashboardLayout'
import IncomeOverview from '../../components/Income/IncomeOverview'
import { API_PATHS } from '../../utils/apiPaths'
import axiosInstance from '../../utils/axiosInstance'
import Modal from '../../components/Modal'
import AddIncomeForm from '../../components/Income/AddIncomeForm'
import EditIncomeForm from '../../components/Income/EditIncomeForm'
import toast from 'react-hot-toast'
import IncomeList from '../../components/Income/IncomeList'
import DeleteAlert from '../../components/DeleteAlert'
import { useUserAuth } from '../../hooks/useUserAuth'
import SearchCard from '../../components/Cards/SearchCard'

const Income = () => {

  useUserAuth();
  const [incomeData, setIncomeData] = useState([])
  const [incomeSources, setIncomeSources] = useState([])
  const [openAddIncomeModal, setOpenAddIncomeModal] = useState(false)
  const [openEditIncomeModal, setOpenEditIncomeModal] = useState(false)
  const [editingIncome, setEditingIncome] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState(null)
  const [openDeleteAlert, setOpenDeleteAlert] = useState({
    show: false,
    data: null
  })

  // Get All Income Details
  const fetchIncomeData = async () =>{
    if(loading) {
      return;
    }
    setLoading(true);

    try{
      const response = await axiosInstance.get(`${API_PATHS.INCOME.GET_ALL_INCOME}`)
      if (response.data){
        setIncomeData(response.data);
        setDateRange(null);
      }  
    } catch (error) {
      console.log("Someting went wrong. Please try again later.", error);
    } finally {
      setLoading(false);
    }

  }

  // Fetch unique income sources
  const fetchIncomeSources = async () => {
    try {
      const response = await axiosInstance.get(API_PATHS.INCOME.GET_UNIQUE_SOURCES);
      if (response.data) {
        setIncomeSources(response.data);
      }
    } catch (error) {
      console.log("Failed to fetch income sources:", error);
    }
  }

  const handleReset = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get(`${API_PATHS.INCOME.GET_ALL_INCOME}`);
      if (response.data) {
        setIncomeData(response.data);
        setDateRange(null);
        toast.success("Đã đặt lại dữ liệu");
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
      const response = await axiosInstance.get(`${API_PATHS.INCOME.GET_INCOME_BY_TIME}`, {
        params: {
          startDate,
          endDate
        }
      });
      
      if (response.data){
        setIncomeData(response.data.transactions);
        setDateRange({ startDate, endDate });
        toast.success(`Đã tải dữ liệu từ ${startDate} đến ${endDate}`);
      }  
    } catch (error) {
      console.log("Something went wrong. Please try again later.", error);
      toast.error("Không thể tải dữ liệu. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  //Handle Add Income
  const handleAddIncome = async(income)=>{
    const {source, amount, date, icon} = income;

    // Validation Checks
    if(!source.trim()){
      toast.error("Nguồn thu nhập là bắt buộc")
      return
    }

    if(!amount || isNaN(amount) || Number(amount) <=0){
      toast.error("Số tiền phải là số hợp lệ và lớn hơn 0")
      return
    }

    if(!date) {
      toast.error("Ngày là bắt buộc")
      return
    }

    try{
      await axiosInstance.post(API_PATHS.INCOME.ADD_INCOME, {
        source,
        amount,
        date,
        icon
      });

      setOpenAddIncomeModal(false);
      toast.success("Thêm thu nhập thành công")
      fetchIncomeData();
      fetchIncomeSources(); // Refresh sources list

    }catch(error){
      console.error(
        "Lỗi khi thêm thu nhập:",
        error.response?.data?.message || error.message
      )
      toast.error("Không thể thêm thu nhập. Vui lòng thử lại.")
    }
  }

  // Handle Update Income
  const handleUpdateIncome = async(income) => {
    const {source, amount, date, icon} = income;

    // Validation Checks
    if(!source.trim()){
      toast.error("Nguồn thu nhập là bắt buộc")
      return
    }

    if(!amount || isNaN(amount) || Number(amount) <=0){
      toast.error("Số tiền phải là số hợp lệ và lớn hơn 0")
      return
    }

    if(!date) {
      toast.error("Ngày là bắt buộc")
      return
    }

    try{
      await axiosInstance.put(API_PATHS.INCOME.UPDATE_INCOME(editingIncome._id), {
        source,
        amount,
        date,
        icon
      });

      setOpenEditIncomeModal(false);
      setEditingIncome(null);
      toast.success("Cập nhật thu nhập thành công")
      fetchIncomeData();

    }catch(error){
      console.error(
        "Lỗi khi cập nhật thu nhập:",
        error.response?.data?.message || error.message
      )
      toast.error("Không thể cập nhật thu nhập. Vui lòng thử lại.")
    }
  }

  // Delete Income
  const deleteIncome = async(id) => {
    try{
      await axiosInstance.delete(API_PATHS.INCOME.DELETE_INCOME(id))

      setOpenDeleteAlert({show: false, data: null})
      toast.success("Xóa thu nhập thành công")
      fetchIncomeData()
    }catch(error){
      console.error(
        "Lỗi khi xóa thu nhập:",
        error.response?.data?.message || error.message
      )
      toast.error("Không thể xóa thu nhập. Vui lòng thử lại.")
    }
  }

  // Handle Download Income Details
  const handleDownloadIncomeDetails = async() =>{
    try{
      const response = await axiosInstance.get(API_PATHS.INCOME.DOWNLOAD_INCOME, 
        {
          responseType: "blob",
        }
      );

      // Create a URL for the blob
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement("a")
      link.href = url,
      link.setAttribute("download", "income_detail.xlsx")
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch(error){
      console.error("Lỗi khi tải file thu nhập:", error)
      toast.error("Không thể tải file. Vui lòng thử lại.")
    }
  }

  useEffect(()=>{
    fetchIncomeData()
    fetchIncomeSources()
    return()=>{}
  }, [])

  return (
    <DashBoardLayout activeMenu="Thu nhập">
      <div className='my-5 mx-auto'>
        <SearchCard onSearch={handleSearch} onReset={handleReset}  className = "mb-3"/>
        <div className = "grid grid-cols-1 gap-6">
          <div className=''>
            <IncomeOverview
              transactions={incomeData}
              onAddIncome={() => setOpenAddIncomeModal(true)}
            />
          </div>
        </div>

        <IncomeList
          transactions = {incomeData}
          onEdit={(income) => {
            setEditingIncome(income);
            setOpenEditIncomeModal(true);
          }}
          onDelete={(id)=>{
              setOpenDeleteAlert({show: true, data: id})
            }
          } 
          onDownload={handleDownloadIncomeDetails}
        />
          

        <Modal
          isOpen = {openAddIncomeModal}
          onClose = {() => setOpenAddIncomeModal(false)}
          title="Thêm thu nhập"
        >
          <AddIncomeForm 
            onAddIncome={handleAddIncome}
            incomeSources={incomeSources}
          />
        </Modal>

        <Modal
          isOpen = {openEditIncomeModal}
          onClose = {() => {
            setOpenEditIncomeModal(false);
            setEditingIncome(null);
          }}
          title="Chỉnh sửa thu nhập"
        >
          <EditIncomeForm 
            incomeData={editingIncome}
            onUpdateIncome={handleUpdateIncome}
          />
        </Modal>

        <Modal
          isOpen = {openDeleteAlert.show}
          onClose = {() => setOpenDeleteAlert({show: false, data: null})}
          title="Xóa thu nhập"
        >
          <DeleteAlert
            content="Bạn có chắc chắn muốn xóa thu nhập này không?"
            onDelete = {() => deleteIncome(openDeleteAlert.data)}
          />
        </Modal>
      </div>
    </DashBoardLayout>
  )
}

export default Income
