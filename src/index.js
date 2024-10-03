import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose
  .connect("mongodb://localhost:27017/hotel_booking", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("connected to mongo db");
  })
  .catch((err) => {
    console.log(err);
  });

const bookingSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  img: {
    data: Buffer,
    contentType: String,
  },
});

const HotelList = mongoose.model("Hotel", bookingSchema);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "upload-express");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + Date.now() + ext);
  },
});

var upload = multer({ storage: storage });

app.post(
  "/api/uploadphoto",
  upload.single("myImage"),
  async (req, res, next) => {
    const file = req.file;
    if (!file) {
      const error = new Error("Please upload a file");
      error.httpStatusCode = 400;
      return next(error);
    }
    const { name, price, city } = req.body;

    if (!name || !price || !city) {
      return;
    }

    try {
      const img = fs.readFileSync(req.file.path);
      const encode_image = img.toString("base64");

      const finalImg = {
        name,
        price: parseFloat(price),
        city,
        img: {
          contentType: req.file.mimetype,
          data: Buffer.from(encode_image, "base64"),
        },
      };

      const result = await HotelList.create(finalImg);

      fs.unlinkSync(req.file.path);

      res.status(200).json({ message: "Uploading successful" });
    } catch (error) {
      console.error("Error processing the file", error);
      res.status(500).send(error.message);
    }
  }
);

app.get("/api/bookings", async (req, res) => {
  try {
    const bookings = await HotelList.find();
    const modifiedBookings = bookings.map((booking) => {
      return {
        _id: booking._id,
        name: booking.name,
        price: booking.price,
        city: booking.city,
        img: {
          contentType: booking.img.contentType,
          data: booking.img.data.toString("base64"),
        },
      };
    });

    res.json(modifiedBookings);
  } catch (error) {
    console.error("Error fetching data", error);
    res.status(500).send(error.message);
  }
});

app.delete(`/api/hotels/:id`, async (req, res) => {
  const hotelid = req.params.id;
  try {
    const hotel = await HotelList.findByIdAndDelete(hotelid);
    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }
    res.status(200).json({ message: "Hotel deleted successfully" });
  } catch (error) {
    console.log("error in deleting hotel", error);
    res.status(500).json({ message: "error deleting hotel" });
  }
});

app.get("/api/search", async (req, res) => {
  const { name, city } = req.query;

  const query = {};

  if (name && name.trim() !== "") {
    query.name = { $regex: name, $options: "i" };
  }

  if (city && city.trim() !== "") {
    query.city = { $regex: city, $options: "i" };
  }

  try {
    const hotels = await HotelList.find(query);
    const modifiedHotels = hotels.map((hotel) => ({
      _id: hotel._id,
      name: hotel.name,
      price: hotel.price,
      city: hotel.city,
      img: {
        contentType: hotel.img.contentType,
        data: hotel.img.data.toString("base64"),
      },
    }));
    res.json(modifiedHotels);
  } catch (error) {
    console.error("Error fetching data", error);
    res.status(500).send(error.message);
  }
});

app.put("/api/hotels/:id", upload.single("myImage"), async (req, res) => {
  const hotelId = req.params.id;
  const { name, price, city } = req.body;

  try {
    let hotel = await HotelList.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    hotel.name = name || hotel.name;
    hotel.price = price ? parseFloat(price) : hotel.price;
    hotel.city = city || hotel.city;

    if (req.file) {
      const img = fs.readFileSync(req.file.path);
      const encode_image = img.toString("base64");
      hotel.img = {
        contentType: req.file.mimetype,
        data: Buffer.from(encode_image, "base64"),
      };
      fs.unlinkSync(req.file.path);
    }

    await hotel.save();

    res.status(200).json({ message: "Hotel updated successfully", hotel });
  } catch (error) {
    console.error("Error updating hotel", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/hotels/:id", async (req, res) => {
  try {
    const hotel = await HotelList.findById(req.params.id);
    if (!hotel) {
      return res.status(404).send("Hotel not found");
    }
    res.json(hotel);
  } catch (error) {
    console.error("Error fetching hotel:", error);
    res.status(500).send("Server error");
  }
});

// User schema
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/.+\@.+\..+/, "Please fill a valid email address"],
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
});

const User = mongoose.model("User", userSchema);

app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.log("failed to signup", error);
    res.status(500).send(error.message);
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, {
      expiresIn: "8h",
    });

    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error("Error during login", error);
    res.status(500).send("Server error");
  }
});

app.post("/api/logout", (req, res) => {
  res.json({ message: "Logged out successfully" });
});

// Admin schema
const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/.+\@.+\..+/, "Please fill a valid email address"],
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
});

const Admin = mongoose.model("Admin", adminSchema);

app.post("/api/admin/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res
        .status(400)
        .json({ message: "Admin with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new Admin({
      username,
      email,
      password: hashedPassword,
    });

    await newAdmin.save();

    res.status(201).json({ message: "Admin registered successfully" });
  } catch (error) {
    console.log("failed to signup", error);
    res.status(500).send(error.message);
  }
});

app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: admin._id, email: admin.email }, JWT_SECRET, {
      expiresIn: "8h",
    });

    res.json({
      token,
      user: { id: admin._id, username: admin.username, email: admin.email },
    });
  } catch (error) {
    console.error("Error during login", error);
    res.status(500).send("Server error");
  }
});

app.post("/api/admin/logout", (req, res) => {
  res.json({ message: "Logged out successfully" });
});

// Middleware for authenticating admin
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    return res
      .status(401)
      .json({ message: "No token provided, authorization denied" });
  }

  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return res
      .status(401)
      .json({ message: "No token provided, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token, authorization denied" });
  }
};

// View all users (for admin)
app.get("/api/admin/users", authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    console.error("Error fetching users", error);
    res.status(500).json({ message: "Server error" });
  }
});

// View all bookings (for admin)
app.get("/api/admin/bookings", authenticateAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("user", "username email")
      .populate("hotel", "name city price");

    res.json(bookings);
  } catch (error) {
    console.error("Error fetching bookings", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Booking schema
const hotelbookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  hotel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hotel",
    required: true,
  },
  checkInDate: {
    type: Date,
    required: true,
  },
  checkOutDate: {
    type: Date,
    required: true,
  },
  roomType: {
    type: String,
    required: true,
  },
  personCount: {
    type: Number,
    required: true,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
});

const Booking = mongoose.model("Booking", hotelbookingSchema);

// Middleware for authenticating users
const authenticateUser = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    return res
      .status(401)
      .json({ message: "No token provided, authorization denied" });
  }

  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return res
      .status(401)
      .json({ message: "No token provided, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token, authorization denied" });
  }
};

// Booking a hotel
app.post("/api/book", authenticateUser, async (req, res) => {
  const { hotelId, checkInDate, checkOutDate, roomType, personCount } =
    req.body;

  try {
    const hotel = await HotelList.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const days = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

    const totalPrice = days * hotel.price;

    const booking = new Booking({
      user: req.user.id,
      hotel: hotelId,
      checkInDate: checkInDate,
      checkOutDate: checkOutDate,
      roomType: roomType,
      personCount: personCount,
      totalPrice,
    });

    await booking.save();

    res.status(201).json({ message: "Booking successful", booking });
  } catch (error) {
    console.error("Error booking hotel", error);
    res.status(500).json({ message: "Server error" });
  }
});

// View user bookings
app.get("/api/my-bookings", authenticateUser, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id })
      .populate("hotel", "name")
      .populate("user", "username");

    const bookingdetails = bookings.map((booking) => ({
      hotelName: booking.hotel?.name || "Unknown Hotel",
      userName: booking.user?.username || "Unknown User",
      totalPrice: booking.totalPrice || 0,
      checkInDate: booking.checkInDate || "Unknown Check-In Date",
      checkOutDate: booking.checkOutDate || "Unknown Check-Out Date",
      personCount: booking.personCount || "Unknown Person Count",
      roomType: booking.roomType || "Unknown Room Type",
    }));

    res.json(bookingdetails);
  } catch (error) {
    console.error("Error fetching bookings", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.listen(port, () => {
  console.log(`server running on ${port}`);
});
