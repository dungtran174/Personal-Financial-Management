import React, { useEffect, useState } from 'react'
import { useUserAuth } from '../../hooks/useUserAuth';
import DashBoardLayout from '../../components/layouts/DashboardLayout';
import { API_PATHS } from '../../utils/apiPaths';
import axiosInstance from '../../utils/axiosInstance';
import toast from 'react-hot-toast';
import ExpenseOverview from '../../components/Expense/ExpenseOverview';
import Modal from '../../components/Modal';
import AddExpenseForm from '../../components/Expense/AddExpenseForm';
import EditExpenseForm from '../../components/Expense/EditExpenseForm';
import ExpenseList from '../../components/Expense/ExpenseList';
import DeleteAlert from '../../components/DeleteAlert';
import SearchCard from '../../components/Cards/SearchCard';

const Expense = () => {
  useUserAuth();

  const [expenseData, setExpenseData] = useState([])
  const [expenseCategories, setExpenseCategories] = useState([])
  const [openAddExpenseModal, setOpenAddExpenseModal] = useState(false)
  const [openEditExpenseModal, setOpenEditExpenseModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState(null)
  const [openDeleteAlert, setOpenDeleteAlert] = useState({
    show: false,
    data: null
  })

  // Get All Expense Details
  const fetchExpenseData = async () =>{
    if(loading) {
      return;
    }
    setLoading(true);

    try{
      const response = await axiosInstance.get(`${API_PATHS.EXPENSE.GET_ALL_EXPENSE}`)
      if (response.data){
        setExpenseData(response.data);
        setDateRange(null);
        console.log("Expense Data: ", response.data)
      }  
    } catch (error) {
      console.log("Someting went wrong. Please try again later.", error);
    } finally {
      setLoading(false);
    }

  }

  // Fetch unique expense categories
  const fetchExpenseCategories = async () => {
    try {
      const response = await axiosInstance.get(API_PATHS.EXPENSE.GET_UNIQUE_CATEGORIES);
      if (response.data) {
        setExpenseCategories(response.data);
      }
    } catch (error) {
      console.log("Failed to fetch expense categories:", error);
    }
  }

  const handleReset = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get(`${API_PATHS.EXPENSE.GET_ALL_EXPENSE}`);
      if (response.data) {
        setExpenseData(response.data);
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
      const response = await axiosInstance.get(`${API_PATHS.EXPENSE.GET_EXPENSE_BY_TIME}`, {
        params: {
          startDate,
          endDate
        }
      });
      
      if (response.data){
        setExpenseData(response.data.transactions);
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

  //Handle Add Expense
  const handleAddExpense = async(expense)=>{
    const {category, amount, date, icon} = expense;

    // Validation Checks
    if(!category.trim()){
      toast.error("Danh mục là bắt buộc")
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
      await axiosInstance.post(API_PATHS.EXPENSE.ADD_EXPENSE, {
        category,
        amount,
        date,
        icon
      });

      setOpenAddExpenseModal(false);
      toast.success("Thêm chi tiêu thành công")
      fetchExpenseData();
      fetchExpenseCategories(); // Refresh categories list

    }catch(error){
      console.error(
        "Lỗi khi thêm chi tiêu:",
        error.response?.data?.message || error.message
      )
      toast.error("Không thể thêm chi tiêu. Vui lòng thử lại.")
    }
  }

  // Handle Update Expense
  const handleUpdateExpense = async(expense) => {
    const {category, amount, date, icon} = expense;

    // Validation Checks
    if(!category.trim()){
      toast.error("Danh mục là bắt buộc")
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
      await axiosInstance.put(API_PATHS.EXPENSE.UPDATE_EXPENSE(editingExpense._id), {
        category,
        amount,
        date,
        icon
      });

      setOpenEditExpenseModal(false);
      setEditingExpense(null);
      toast.success("Cập nhật chi tiêu thành công")
      fetchExpenseData();

    }catch(error){
      console.error(
        "Lỗi khi cập nhật chi tiêu:",
        error.response?.data?.message || error.message
      )
      toast.error("Không thể cập nhật chi tiêu. Vui lòng thử lại.")
    }
  }

    // Delete Expense
  const deleteExpense = async(id) => {
    try{
      await axiosInstance.delete(API_PATHS.EXPENSE.DELETE_EXPENSE(id))

      setOpenDeleteAlert({show: false, data: null})
      toast.success("Xóa chi tiêu thành công")
      fetchExpenseData()
    }catch(error){
      console.error(
        "Lỗi khi xóa chi tiêu:",
        error.response?.data?.message || error.message
      )
      toast.error("Không thể xóa chi tiêu. Vui lòng thử lại.")
    }
  }

  // Handle Download Expense Details
  const handleDownloadExpenseDetails = async() =>{
    try{
      const response = await axiosInstance.get(API_PATHS.EXPENSE.DOWNLOAD_EXPENSE, 
        {
          responseType: "blob",
        }
      );

      // Create a URL for the blob
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement("a")
      link.href = url,
      link.setAttribute("download", "expense_detail.xlsx")
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch(error){
      console.error("Lỗi khi tải file chi tiêu:", error)
      toast.error("Không thể tải file. Vui lòng thử lại.")
    }
  }

  useEffect(()=>{
    fetchExpenseData()
    fetchExpenseCategories()
    return()=>{}
  }, [])
  return (

    <DashBoardLayout activeMenu="Chi tiêu">
      <div className='my-5 mx-auto'>
        <SearchCard onSearch={handleSearch} onReset={handleReset} />
        <div className = "grid grid-cols-1 gap-6">
          <div className=''>
            <ExpenseOverview
              transactions={expenseData}
              onAddExpense={() => setOpenAddExpenseModal(true)}
            />
          </div>
        </div>

        <ExpenseList
          transactions = {expenseData}
          onEdit={(expense) => {
            setEditingExpense(expense);
            setOpenEditExpenseModal(true);
          }}
          onDelete={(id)=>{
              setOpenDeleteAlert({show: true, data: id})
            }
          } 
          onDownload={handleDownloadExpenseDetails}
        />

        <Modal
          isOpen = {openAddExpenseModal}
          onClose = {() => setOpenAddExpenseModal(false)}
          title="Thêm chi tiêu"
        >
          <AddExpenseForm 
            onAddExpense={handleAddExpense}
            expenseCategories={expenseCategories}
          />
        </Modal>

        <Modal
          isOpen = {openEditExpenseModal}
          onClose = {() => {
            setOpenEditExpenseModal(false);
            setEditingExpense(null);
          }}
          title="Chỉnh sửa chi tiêu"
        >
          <EditExpenseForm 
            expenseData={editingExpense}
            onUpdateExpense={handleUpdateExpense}
          />
        </Modal>

        <Modal
          isOpen = {openDeleteAlert.show}
          onClose = {() => setOpenDeleteAlert({show: false, data: null})}
          title="Xóa chi tiêu"
        >
          <DeleteAlert
            content="Bạn có chắc chắn muốn xóa chi tiêu này không?"
            onDelete = {() => deleteExpense(openDeleteAlert.data)}
          />
        </Modal>
      </div>
    </DashBoardLayout>
  )
}

export default Expense
