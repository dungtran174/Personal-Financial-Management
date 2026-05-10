const jwt = require('jsonwebtoken');
const User = require('../models/User');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Generate JWT Token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '7d',
    });
}

// REGISTER USER
exports.registerUser = async (req, res) => {
    const {fullName, email, password, profilePicture} = req.body || {};

    // Validation: Check for missing fialds
    if(!fullName || !email || !password){
        return res.status(400).json({message: 'Please fill in all required fields'});
    }

    try{
        // Check if user already exists
        const existingUser = await User.findOne({email});
        if(existingUser){
            return res.status(400).json({message: 'Email already in use'});
        }

        // Create the user
        const user = await User.create({
            fullName,
            email,
            password,
            profilePicture
        }); 

        res.status(201).json({
            id: user._id,
            user,
            token: generateToken(user._id)
        })
    }
    catch(error){
        res
            .status(500)
            .json({message: "Error registering user", error: error.message})
    }
} 

// LOGIN USER
exports.loginUser = async (req, res) => {
    const {email, password} = req.body || {};

    if(!email || !password){
        return res.status(400).json({message: 'Please provide email and password'});
    }
    try{
        const user = await User.findOne({ email })
        if(!user || ! (await user.comparePassWord(password))){
            return res.status(400).json({message: "Invalid email or password"});
        }

        res.status(200).json({
            id: user._id,
            user,
            token: generateToken(user._id)
        });
    } catch(error){
        res
            .status(500)
            .json({message: "Error logging in", error: error.message})
    }
} 

exports.getUseInfo = async (req, res) => {
    try{
        const user = await User.findById(req.user.id).select("-password")
        if(!user){
            return res.status(404).json({message: "User not found"});
        }
        res.status(200).json(user);
    } catch(error){
        res
            .status(500)
            .json({message: "Error fetching user info", error: error.message})
    }
}

// Forgot Password
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "Không tìm thấy tài khoản với email này" });
        }

        // Generate random token
        const resetToken = crypto.randomBytes(20).toString('hex');

        // Hash token and save to DB
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // Expires in 10 minutes

        await user.save();

        // Create reset URL
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

        const message = `
            <h1>Bạn đã yêu cầu đặt lại mật khẩu</h1>
            <p>Vui lòng truy cập đường dẫn sau để đặt lại mật khẩu:</p>
            <a href="${resetUrl}" clicktracking=off>${resetUrl}</a>
        `;

        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.error("Missing email configuration: EMAIL_USER or EMAIL_PASS");
            throw new Error("Server email configuration is missing.");
        }

        // Configure email transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        await transporter.sendMail({
            to: user.email,
            subject: "Yêu cầu đặt lại mật khẩu",
            html: message,
        });

        res.status(200).json({ message: "Email đặt lại mật khẩu đã được gửi" });
    } catch (error) {
        console.error("Forgot Password Error:", error);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save({ validateBeforeSave: false });
        res.status(500).json({ message: "Lỗi gửi email", error: error.message });
    }
};

// Reset Password
exports.resetPassword = async (req, res) => {
    const { resetToken } = req.params;
    const { password } = req.body;

    // Password Validation
    if (password.length < 8) {
        return res.status(400).json({ message: "Mật khẩu phải có ít nhất 8 ký tự" });
    }
    if (!/[a-z]/.test(password)) {
        return res.status(400).json({ message: "Mật khẩu phải chứa ít nhất một chữ thường (a-z)" });
    }
    if (!/[A-Z]/.test(password)) {
        return res.status(400).json({ message: "Mật khẩu phải chứa ít nhất một chữ hoa (A-Z)" });
    }
    if (!/\d/.test(password)) {
        return res.status(400).json({ message: "Mật khẩu phải chứa ít nhất một số (0-9)" });
    }

    try {
        // Hash token from URL to compare with DB
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }, // Check if not expired
        });

        if (!user) {
            return res.status(400).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
        }

        // Update password
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        res.status(200).json({ message: "Đặt lại mật khẩu thành công" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi đặt lại mật khẩu", error: error.message });
    }
};

// Validate Reset Token (Check if link is still valid)
exports.validateResetToken = async (req, res) => {
    const { resetToken } = req.params;

    try {
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
        }

        res.status(200).json({ message: "Token hợp lệ" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi kiểm tra token", error: error.message });
    }
};
