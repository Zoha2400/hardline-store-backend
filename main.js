import express from "express";
import validator from "validator";
import { pool } from "./database/db.js";
import bcrypt from "bcryptjs";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);
app.use(cookieParser());

app.get("/", (req, res) => {
  res.json("success");
});

app.post("/reg", async (req, res) => {
  const secretKey = "yourSecretKey";

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Email is not valid" });
  }

  if (!validator.isStrongPassword(password)) {
    return res.status(400).json({
      error:
        "Password is not strong enough. { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 }",
    });
  }

  const client = await pool.connect();

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await client.query(
      "INSERT INTO users (password, email) VALUES ($1, $2) RETURNING *",
      [passwordHash, email],
    );

    const token = jwt.sign(
      { id: result.rows[0].id, email: result.rows[0].email },
      secretKey,
      { expiresIn: "24h" },
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.cookie("email", email, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      message: "User created successfully",
      data: { email: result.rows[0].email },
    });
  } catch (err) {
    console.error("Error creating user:", err);

    if (err.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }

    return res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const secretKey = "yourSecretKey";

  if (!email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Email is not valid" });
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      "SELECT password FROM users WHERE email = $1",
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const hashedPassword = result.rows[0].password;

    const isRealPassword = await bcrypt.compare(password, hashedPassword);

    if (isRealPassword) {
      const token = jwt.sign(
        { id: result.rows[0].id, email: result.rows[0].email },
        secretKey,
        { expiresIn: "24h" }, // Токен действителен 1 час
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // только для HTTPS в продакшене
        sameSite: "Strict",
        maxAge: 24 * 60 * 60 * 1000, // Токен живет 1 день
      });
      res.cookie("email", email, {
        httpOnly: false, // Это можно сделать доступным для JS, если нужно
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return res.status(201).json({
        message: "Logged In Successfully",
        data: { email: email },
      });
    } else {
      return res.status(401).json({ error: "Invalid password" });
    }
  } catch (err) {
    console.error("Error during login", err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

app.delete("/logout", (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: "Not authorized" });
  }

  const payload = jwt.verify(token, "yourSecretKey");

  if (payload) {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
    });
    res.clearCookie("email", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
    });
    res.json({ message: "Logged out successfully" });
  } else {
    console.error("Error verifying token:", err);
    res.status(403).json({ error: "Unauthorized" });
  }
});

app.delete("/delete", async (req, res) => {
  const token = req.cookies.token;
  const email = req.cookies.email;

  if (!token) {
    return res.status(401).json({ error: "Not authorized" });
  }

  try {
    const client = await pool.connect();
    const payload = jwt.verify(token, "yourSecretKey");
    if (payload) {
      try {
        await client.query("DELETE FROM users WHERE email = $1", [email]);
        res.json({
          message: "User deleted successfully",
        });
      } catch (err) {
        console.error("Error deleting user:", err);
        return res.status(500).json({ error: "Server error" });
      }
    }
  } catch (err) {
    console.error("Error verifying token:", err);
    res.status(403).json({ error: "Unauthorized" });
  } finally {
    client.release();
  }
});

app.put("/addCart", async (req, res) => {
  const token = req.cookies.token;
  const email = req.body.email;

  if (!token) {
    return res.status(401).json({ error: "Not authorized" });
  }

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const { productId, quantity } = req.body;

  if (!productId || !quantity) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const client = await pool.connect();

    const payload = jwt.verify(token, "yourSecretKey");
    if (!payload) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      const userResult = await client.query(
        "SELECT user_uuid FROM users WHERE email = $1",
        [email],
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const userUuid = userResult.rows[0].user_uuid;

      const result = await client.query(
        `INSERT INTO cart (user_uuid, item_uuid, quantity)
                 VALUES ($1, $2::UUID, $3)
                     ON CONFLICT (user_uuid, item_uuid) 
                     DO UPDATE SET quantity = cart.quantity + EXCLUDED.quantity;`,
        [userUuid, productId, quantity],
      );

      res.json({
        message: "Product added to cart successfully",
      });
    } catch (err) {
      console.error("Error interacting with database:", err);
      return res.status(500).json({ error: "Server error" });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error verifying token:", err);
    res.status(403).json({ error: "Unauthorized" });
  }
});

async function getUserUUID(client, email) {
  try {
    const result = await client.query(
      "SELECT user_uuid FROM users WHERE email = $1",
      [email],
    );

    if (result.rows.length === 0) {
      console.error("User not found for email:", email);
      return null;
    }

    return result.rows[0].user_uuid;
  } catch (err) {
    console.error("Error fetching user UUID:", err);
    return null;
  }
}

async function getItemUUID(client, itemId) {
  try {
    const result = await client.query(
      "SELECT item_uuid FROM items WHERE id = $1",
      [itemId],
    );
    return result.rows[0]?.item_uuid || null;
  } catch (err) {
    console.error("Error fetching item UUID:", err);
    return null;
  } finally {
    client.release();
  }
}

function jwtChecker(token) {
  try {
    const payload = jwt.verify(token, "yourSecretKey");
    return payload;
  } catch (err) {
    return null;
  }
}

app.get("/isCart/:id", async (req, res) => {
  const token = req.cookies.token;
  const { id } = req.params;
  const email = req.query.email;

  if (!token) {
    return res.status(401).json({ error: "Not authorized" });
  }

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const payload = jwtChecker(token);
  if (!payload) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const client = await pool.connect();

    try {
      const userUuid = await getUserUUID(client, email);
      const itemUuid = await getItemUUID(client, id);

      if (!userUuid || !itemUuid) {
        return res.status(404).json({ error: "User or item not found" });
      }

      const result = await client.query(
        "SELECT * FROM cart WHERE item_uuid = $1 AND user_uuid = $2",
        [itemUuid, userUuid],
      );

      return res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error fetching cart data:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/removeCart", async (req, res) => {
  const token = req.cookies.token;
  const { email, productId } = req.body;

  console.log("Token из cookies:", token);
  console.log("Тело запроса:", req.body);

  if (!token) return res.status(401).json({ error: "Not authorized" });
  if (!email) return res.status(400).json({ error: "Email is required" });
  if (!productId)
    return res.status(400).json({ error: "Product ID is required" });

  try {
    const client = await pool.connect();
    console.log("Подключение к базе данных успешно");

    const payload = jwt.verify(token, "yourSecretKey");
    console.log("Payload после проверки токена:", payload);

    if (!payload) return res.status(403).json({ error: "Unauthorized" });

    const userResult = await client.query(
      "SELECT user_uuid FROM users WHERE email = $1",
      [email],
    );
    console.log("Результат поиска пользователя:", userResult.rows);

    if (userResult.rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    const userUuid = userResult.rows[0].user_uuid;
    console.log("userUuid: ", userUuid);

    const cartItemResult = await client.query(
      "SELECT * FROM cart WHERE user_uuid = $1 AND item_uuid = $2::uuid",
      [userUuid, productId],
    );
    console.log("Результат поиска товара в корзине:", cartItemResult.rows);

    if (cartItemResult.rows.length === 0) {
      console.log(
        "Товар не найден в корзине для user_uuid:",
        userUuid,
        "и item_uuid:",
        productId,
      );
      return res.status(404).json({ error: "Product not found in cart" });
    }

    await client.query(
      "DELETE FROM cart WHERE user_uuid = $1 AND item_uuid = $2::uuid",
      [userUuid, productId],
    );
    console.log("Товар удален из корзины");

    res.json({ message: "Product removed from cart successfully" });
  } catch (err) {
    console.error("Ошибка при обработке запроса:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/products", async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query("SELECT * FROM products");
    res.json(result.rows);
  } catch (err) {
    console.error("Error getting users:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

app.get("/product/:id", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const result = await client.query(
      "SELECT * FROM products WHERE product_id = $1",
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error getting product:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

app.get("/get_cart", async (req, res) => {
  const token = req.cookies.token;
  const email = req.cookies.email;

  console.log("Token ", token);
  if (!token) {
    return res.status(401).json({ error: "Not authorized" });
  }

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "yourSecretKey",
    );
    if (payload) {
      const client = await pool.connect();
      try {
        const userResult = await client.query(
          "SELECT user_uuid FROM users WHERE email = $1",
          [email],
        );

        if (userResult.rows.length === 0) {
          return res.status(404).json({ error: "User not found" });
        }

        const userUuid = userResult.rows[0].user_uuid;

        const cartResult = await client.query(
          `SELECT c.cart_id, c.cart_uuid, c.quantity, p.product_id, p.product_uuid, p.product_name, p.product_description, p.price, p.img, p.rate, p.category
           FROM cart c
           JOIN products p ON c.item_uuid = p.product_uuid
           WHERE c.user_uuid = $1`,
          [userUuid],
        );

        if (cartResult.rows.length === 0) {
          return res.json({ message: "Cart is empty", cart: [] });
        }

        res.json({ cart: cartResult.rows });
      } catch (err) {
        console.error("Error getting cart:", err);
        res.status(500).json({ error: "Server error" });
      } finally {
        client.release(); // Освобождаем соединение
      }
    }
  } catch (err) {
    console.error("Error verifying token:", err);
    res.status(403).json({ error: "Unauthorized" });
  }
});

async function getProductUUID(product_id) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      "SELECT product_uuid FROM products WHERE product_id = $1",
      [product_id],
    );
    return result.rows[0]?.product_uuid || null;
  } catch (err) {
    console.error("Error getting product UUID:", err);
    return null;
  } finally {
    client.release();
  }
}

async function getEmailByUserUUID(user_uuid) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      "SELECT email FROM users WHERE user_uuid = $1",
      [user_uuid],
    );
    return result.rows[0]?.email || null;
  } catch (err) {
    console.error("Error getting email");
    return null;
  } finally {
    client.release();
  }
}

app.get("/comments/:id", async (req, res) => {
  const { id } = req.params;

  const productUUID = await getProductUUID(id); // Ожидаем завершения получения UUID

  if (!productUUID) {
    return res.status(404).json({ error: "Product not found" });
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      "SELECT * FROM comments WHERE product_uuid = $1",
      [productUUID],
    );

    const commentsWithEmails = await Promise.all(
      result.rows.map(async (comment) => {
        const email = await getEmailByUserUUID(comment.user_uuid);
        return { ...comment, email };
      }),
    );

    res.json(commentsWithEmails);
  } catch (err) {
    console.error("Error getting comments:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.post("/add_comments/:id", async (req, res) => {
  const { id } = req.params;
  const token = req.cookies.token;
  const email = req.cookies.email;
  const { comment_text } = req.body;

  const client = await pool.connect();

  try {
    const productUUID = await getProductUUID(id);
    const userUUID = await getUserUUID(client, email);

    console.log("User UUID:", userUUID);
    console.log("Product UUID:", productUUID);

    if (!userUUID) {
      return res.status(400).json({ error: "User not found" });
    }

    if (!jwtChecker(token)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await client.query(
      "INSERT INTO comments (product_uuid, user_uuid, comment_text) VALUES ($1, $2, $3)",
      [productUUID, userUUID, comment_text],
    );

    const result = await client.query(
      "SELECT * FROM comments WHERE product_uuid = $1",
      [productUUID],
    );

    const commentsWithEmails = await Promise.all(
      result.rows.map(async (comment) => {
        const email = await getEmailByUserUUID(comment.user_uuid); // Функция для получения имени пользователя
        return { ...comment, email };
      }),
    );

    res.status(200).json({ comments: commentsWithEmails });
  } catch (e) {
    console.error("Error writing to the database:", e);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.get("/profile", async (req, res) => {
  const token = req.cookies.token;
  const email = req.cookies.email;

  if (!email) {
    return res.status(400).json({ error: "Email not found in cookies" });
  }

  if (!token || !email) {
    return res.status(401).json({ error: "Not authorized" });
  }

  try {
    const payload = await jwtChecker(token);
    if (!payload) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT phone, address, updated_at FROM users WHERE email = $1",
        [email],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = result.rows[0];
      res.json({
        email,
        phone: user.phone,
        address: user.address,
        updated_at: user.updated_at,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error handling profile route:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/profile", async (req, res) => {
  const token = req.cookies.token;
  const email = req.cookies.email;

  if (!token || !email) {
    return res.status(401).json({ error: "Not authorized" });
  }

  const { phone, address } = req.body;

  if (!phone || !address) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const client = await pool.connect();
    const payload = jwt.verify(token, "yourSecretKey"); // Подразумевается, что ключ корректный

    if (payload) {
      try {
        const result = await client.query(
          "UPDATE users SET phone = $1, address = $2, updated_at = NOW() WHERE email = $3 RETURNING phone, address, email, updated_at",
          [phone, address, email],
        );

        if (result.rowCount === 0) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json({
          message: "Profile updated successfully",
          profile: result.rows[0],
        });
      } catch (err) {
        console.error("Error updating user profile:", err);
        return res.status(500).json({ error: "Server error" });
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error("Error verifying token:", err);
    res.status(403).json({ error: "Unauthorized" });
  }
});

app.post("/checkout", async (req, res) => {
  const token = req.cookies.token;
  const { email, cartItems, cardNumber } = req.body;

  console.log("Received request for checkout:", {
    token,
    email,
    cartItems,
    cardNumber,
  });

  if (!token) {
    console.log("Error: No token provided");
    return res.status(401).json({ error: "Not authorized" });
  }

  if (!email) {
    console.log("Error: No email provided");
    return res.status(400).json({ error: "Email is required" });
  }

  if (!cartItems || cartItems.length === 0) {
    console.log("Error: Cart is empty");
    return res.status(400).json({ error: "Cart is empty" });
  }

  if (!cardNumber || cardNumber.length !== 16) {
    console.log("Error: Invalid card number", cardNumber);
    return res.status(400).json({ error: "Invalid card number" });
  }

  try {
    console.log("Verifying token...");
    const payload = jwt.verify(token, "yourSecretKey");
    if (!payload) {
      console.log("Error: Unauthorized - Invalid token");
      return res.status(403).json({ error: "Unauthorized" });
    }

    console.log("Token verified, fetching user data...");
    const client = await pool.connect();

    const userResult = await client.query(
      "SELECT user_uuid FROM users WHERE email = $1",
      [email],
    );

    if (userResult.rows.length === 0) {
      console.log("Error: User not found for email:", email);
      return res.status(404).json({ error: "User not found" });
    }

    const userUuid = userResult.rows[0].user_uuid;
    console.log("User found. user_uuid:", userUuid);

    const totalPrice = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    console.log("Total price calculated:", totalPrice);

    const orderResult = await client.query(
      "INSERT INTO orders (user_uuid, total_price, order_status, cart_data, credit_card) VALUES ($1, $2, $3, $4, $5) RETURNING order_uuid",
      [userUuid, totalPrice, "Pending", JSON.stringify(cartItems), cardNumber],
    );
    const orderUuid = orderResult.rows[0].order_uuid;
    console.log("Order placed successfully. order_uuid:", orderUuid);

    // Удаление товаров из корзины
    await client.query("DELETE FROM cart WHERE user_uuid = $1", [userUuid]);
    console.log("Cart items removed from cart for user_uuid:", userUuid);

    res.status(200).json({
      message: "Order placed successfully",
      orderUuid: orderUuid,
    });
  } catch (err) {
    console.error("Error processing the order:", err);

    // Логируем ошибку более подробно
    if (err instanceof jwt.JsonWebTokenError) {
      console.log("JWT Error:", err.message);
    } else if (err.code) {
      console.log("Database Error Code:", err.code);
    } else {
      console.log("Unknown Error:", err);
    }

    res.status(500).json({ error: "Server error" });
  }
});

app.get("/orders", async (req, res) => {
  const token = req.cookies.token;
  const { email } = req.query; // Используем req.query, так как данные передаются через параметры запроса

  if (!token || !email) {
    return res.status(401).json({ error: "Not authorized" });
  }

  const payload = jwtChecker(token);

  if (payload) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM orders WHERE user_uuid = (SELECT user_uuid FROM users WHERE email = $1)",
        [email],
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error: ", err);
      res.status(500).json({ error: "Internal Server Error" });
    } finally {
      client.release();
    }
  } else {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

const server = app.listen(8000, () => {
  console.log("Server is running on port 8000");
});

server.setTimeout(0);
