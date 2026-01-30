const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);

// ================= CORS & Socket Settings =================
// الحل هنا: شيلنا /send-f/ وخلينا الدومين الأساسي فقط
const allowedOrigins = [
  "https://mhmdyxt.github.io", 
  "http://127.0.0.1:5500", 
  "http://localhost:3000"
];

const io = new Server(server, {
  cors: { 
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ================= Middleware =================
app.use(cors({
  origin: allowedOrigins
}));
app.use(express.json());

// خدمة الملفات الثابتة (لو رفعت الـ front-end مع السيرفر)
app.use(express.static(path.join(__dirname, "front-end")));

// ================= Routes =================
app.get("/", (req, res) => {
  res.send("🚀 Server is live and waiting for connections...");
});

// ================= Socket Logic =================
const brandOwners = {};   // { brandCode: socket.id }
const uploads = {};       // { brandCode: [media] }
const TTL = 30 * 60 * 1000; // صلاحية الملف 30 دقيقة

io.on("connection", (socket) => {
  console.log("🟢 New Connection:", socket.id);

  // تسجيل صاحب البراند (Dashboard)
  socket.on("register-owner", (brandCode) => {
    // نضمن إن الكود رقم دايماً
    const code = Number(brandCode);

    if (!code || code < 1 || code > 500) {
      socket.emit("error-msg", "Invalid brand code");
      return;
    }

    brandOwners[code] = socket.id;
    console.log(`✅ Owner registered for brand: ${code}`);

    // إرسال الملفات المخزنة حالياً لهذا البراند فور دخوله
    socket.emit("existing-media", uploads[code] || []);
  });

  // استقبال ملف من العميل
  socket.on("send-media", ({ brandCode, data, type, name }) => {
    const code = Number(brandCode);

    if (!code || !data) {
      console.log("⚠️ Received incomplete data");
      return;
    }

    if (!uploads[code]) uploads[code] = [];

    const media = {
      id: Date.now().toString(),
      data,
      type,
      name,
      createdAt: Date.now()
    };

    uploads[code].push(media);

    // إرسال الملف فوراً لصاحب البراند لو فاتح الداشبورد
    if (brandOwners[code]) {
      io.to(brandOwners[code]).emit("new-media", media);
      console.log(`📩 Media pushed to owner of brand ${code}`);
    } else {
      console.log(`☁️ Media saved in memory for brand ${code} (Owner offline)`);
    }

    // حذف تلقائي بعد انتهاء الـ TTL
    setTimeout(() => {
      if (uploads[code]) {
        uploads[code] = uploads[code].filter(m => m.id !== media.id);
        if (brandOwners[code]) {
          io.to(brandOwners[code]).emit("delete-media", media.id);
        }
      }
    }, TTL);
  });

  // حذف يدوي من الداشبورد
  socket.on("delete-media-request", ({ brandCode, id }) => {
    const code = Number(brandCode);
    if (uploads[code]) {
      uploads[code] = uploads[code].filter(m => m.id !== id);
      if (brandOwners[code]) {
        io.to(brandOwners[code]).emit("delete-media", id);
      }
    }
  });

  socket.on("disconnect", () => {
    for (const code in brandOwners) {
      if (brandOwners[code] === socket.id) {
        console.log(`🔴 Owner of brand ${code} disconnected`);
        delete brandOwners[code];
      }
    }
  });
});

// ================= Start Server =================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});