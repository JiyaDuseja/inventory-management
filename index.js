// Import required modules
const express = require("express");
const cors = require("cors");
require('dotenv').config();

const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

// Middleware to verify JWT token
const authenticateUser = (req, res, next) => {
    const token = req.header("Authorization");

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token.replace("Bearer ", ""), SECRET_KEY);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: "Invalid token" });
    }
};

// Initialize Express app
const app = express();
app.use(cors());

app.use(cors({
    origin: "*", // Replace with frontend URL
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

const PORT = process.env.PORT || 3000;

// Middleware to parse JSON requests
app.use(express.json());

// // Load Firebase credentials
// const serviceAccount = require("./firebase-key.json");

// // Initialize Firebase Admin SDK
// admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
// });
const firebaseConfigJSON = Buffer.from(process.env.FIREBASE_CONFIG_BASE64, "base64").toString("utf-8");

// Parse JSON
const firebaseConfig = JSON.parse(firebaseConfigJSON);

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
});

const db = admin.firestore();

// Secret key for JWT (Change this for production)
const SECRET_KEY = "your_jwt_secret";

// ✅ Test Route
app.get("/", (req, res) => {
    res.send("🔥 Firebase Firestore is connected!");
});

// ✅ Signup Route (Register User)
app.post("/signup", async (req, res) => {
    console.log('hi')
    try {
        console.log("Signup route hit"); // Debugging log

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // Hash password before storing
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user in Firebase Authentication
        const userRecord = await admin.auth().createUser({
            email,
            password,
        });

        // Store user in Firestore
        await db.collection("users").doc(userRecord.uid).set({
            email,
            password: hashedPassword,
        });

        res.status(201).json({ message: "User registered successfully!", userId: userRecord.uid });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ Login Route
app.post("/login", async (req, res) => {
    try {
        console.log("Login route hit"); // Debugging log

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // Get user from Firestore
        const userSnapshot = await db.collection("users").where("email", "==", email).get();

        if (userSnapshot.empty) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        // Extract user data
        const userDoc = userSnapshot.docs[0];
        const user = userDoc.data();

        // Compare hashed password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        // Generate JWT Token
        const token = jwt.sign({ userId: userDoc.id, email: user.email }, SECRET_KEY, { expiresIn: "1h" });

        res.status(200).json({ message: "Login successful!", token });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a new product (Protected Route)
app.post("/products", authenticateUser, async (req, res) => {
    try {
        const { name, quantity, price } = req.body;

        if (!name || !quantity || !price) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const newProduct = {
            name,
            quantity,
            price,
            createdBy: req.user.userId, // Store user ID from JWT
            createdAt: new Date(),
        };

        const productRef = await db.collection("products").add(newProduct);

        res.status(201).json({ message: "Product added successfully!", id: productRef.id });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get all products (Protected Route)
app.get("/products", authenticateUser, async (req, res) => {
    try {
        const productsSnapshot = await db.collection("products").get();
        const products = [];

        productsSnapshot.forEach((doc) => {
            const productData = doc.data();
            products.push({
                id: doc.id, // Ensure the product ID is included
                name: productData.name,
                quantity: productData.quantity,
                price: productData.price,
                createdBy: productData.createdBy || "Unknown", // Ensure it shows a default if missing
                createdAt: productData.createdAt || "N/A" // Ensure it shows a default if missing
            });
        });

        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ error: "Unable to fetch products" });
    }
});

// Update a product (Protected Route)
app.put("/products/:id", authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, quantity, price } = req.body;

        // Check if product exists
        const productRef = db.collection("products").doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({ error: "Product not found" });
        }

        // Update only provided fields
        const updatedData = {};
        if (name !== undefined) updatedData.name = name;
        if (quantity !== undefined) updatedData.quantity = quantity;
        if (price !== undefined) updatedData.price = price;

        await productRef.update(updatedData);

        res.status(200).json({ message: "Product updated successfully!" });

    } catch (error) {
        res.status(500).json({ error: "Unable to update product" });
    }
});
// Delete a product (Protected Route)
app.delete("/products/:id", authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if product exists
        const productRef = db.collection("products").doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({ error: "Product not found" });
        }

        // Delete the product
        await productRef.delete();

        res.status(200).json({ message: "Product deleted successfully!" });

    } catch (error) {
        res.status(500).json({ error: "Unable to delete product" });
    }
});


// ✅ Start the server
app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
});
