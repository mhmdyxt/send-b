const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: "https://mhmdyxt.github.io/send-f/", // السماح للـ front-end على GitHub Pages
    methods: ["GET", "POST"]
  }
});

// ================= Middleware =================
app.use(cors({
  origin: "https://mhmdyxt.github.io/send-f/" // السماح للـ front-end على GitHub Pages
}));
app.use(express.json());

// ⬅️ مهم جدًا: خدمة ملفات الـ front-end (لتطوير محلي)
app.use(express.static(path.join(__dirname, "../front-end")));

// ================= Routes =================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../front-end/login.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "../front-end/admin.html"));
});

app.get("/owner", (req, res) => {
  res.sendFile(path.join(__dirname, "../front-end/owner.html"));
});

app.get("/send", (req, res) => {
  res.sendFile(path.join(__dirname, "../front-end/send.html"));
});

// ================= Socket Logic =================
const brandOwners = {};   // { brandCode: socket.id }
const uploads = {};       // { brandCode: [media] }
const TTL = 30 * 60 * 1000; // 30 دقيقة

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  socket.on("register-owner", (brandCode) => {
    brandCode = Number(brandCode);

    if (!brandCode || brandCode < 1 || brandCode > 200) {
      socket.emit("error-msg", "Invalid brand code");
      return;
    }

    brandOwners[brandCode] = socket.id;
    console.log(`✅ Owner registered: ${brandCode}`);

    socket.emit("existing-media", uploads[brandCode] || []);
  });

  socket.on("send-media", ({ brandCode, data, type, name }) => {
    brandCode = Number(brandCode);

    if (!brandCode || !data) return;

    if (!uploads[brandCode]) uploads[brandCode] = [];

    const media = {
      id: Date.now().toString(),
      data,
      type,
      name,
      createdAt: Date.now()
    };

    uploads[brandCode].push(media);

    if (brandOwners[brandCode]) {
      io.to(brandOwners[brandCode]).emit("new-media", media);
    }

    console.log(`📩 Media sent to brand ${brandCode}`);

    setTimeout(() => {
      if (uploads[brandCode]) {
        uploads[brandCode] = uploads[brandCode].filter(m => m.id !== media.id);
        if (brandOwners[brandCode]) {
          io.to(brandOwners[brandCode]).emit("delete-media", media.id);
        }
      }
    }, TTL);
  });

  socket.on("delete-media-request", ({ brandCode, id }) => {
    brandCode = Number(brandCode);
    if (uploads[brandCode]) {
      uploads[brandCode] = uploads[brandCode].filter(m => m.id !== id);
      if (brandOwners[brandCode]) {
        io.to(brandOwners[brandCode]).emit("delete-media", id);
      }
    }
  });

  socket.on("disconnect", () => {
    for (const code in brandOwners) {
      if (brandOwners[code] === socket.id) {
        delete brandOwners[code];
        console.log(`🔴 Owner ${code} disconnected`);
      }
    }
  });
});

// ================= Start Server =================
const PORT = process.env.PORT || 3000; // جاهز لأي استضافة مجانية
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
