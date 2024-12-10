import express from "express";
import { pool } from "./database/db.js";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { login, reg } from "./auth.js";

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);
app.use(cookieParser());

function authenticateToken(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  jwt.verify(token, process.env.JWT, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Forbidden" });
    }
    req.user = user;
    next();
  });
}

app.get("/", (req, res) => {
  res.json("success");
});

app.post("/reg", reg);
app.post("/login", login);

app.delete("/logout", authenticateToken, (req, res) => {
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
});

app.delete("/delete", authenticateToken, async (req, res) => {
  const email = req.cookies.email;

  const client = await pool.connect();
  try {
    await client.query("DELETE FROM users WHERE email = $1", [email]);
    res.json({
      message: "User deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting user:", err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

app.put("/addCart", authenticateToken, async (req, res) => {
  const email = req.body.email;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const { productId, quantity } = req.body;

  if (!productId || !quantity) {
    return res.status(400).json({ error: "All fields are required" });
  }

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

app.get("/isCart/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const email = req.query.email;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const client = await pool.connect();

  try {
    const { rows: userRows } = await client.query(
      "SELECT user_uuid FROM users WHERE email = $1",
      [email],
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userUuid = userRows[0].uuid;

    const { rows: itemRows } = await client.query(
      "SELECT item_uuid FROM cart WHERE cart_id = $1",
      [id],
    );

    if (itemRows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const itemUuid = itemRows[0].item_uuid; // Assuming item_uuid is the correct column name

    const { rows: cartRows } = await client.query(
      "SELECT quantity FROM cart WHERE item_uuid = $1 AND user_uuid = $2",
      [itemUuid, userUuid],
    );

    if (cartRows.length > 0) {
      return res.json({ inCart: true, quantity: cartRows[0].quantity });
    } else {
      return res.json({ inCart: false });
    }
  } finally {
    client.release();
  }
});

app.post("/removeCart", authenticateToken, async (req, res) => {
  const { email, productId } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });
  if (!productId)
    return res.status(400).json({ error: "Product ID is required" });

  const client = await pool.connect();

  const userResult = await client.query(
    "SELECT user_uuid FROM users WHERE email = $1",
    [email],
  );

  if (userResult.rows.length === 0)
    return res.status(404).json({ error: "User not found" });

  const userUuid = userResult.rows[0].user_uuid;

  const cartItemResult = await client.query(
    "SELECT * FROM cart WHERE user_uuid = $1 AND item_uuid = $2::uuid",
    [userUuid, productId],
  );

  if (cartItemResult.rows.length === 0) {
    return res.status(404).json({ error: "Product not found in cart" });
  }

  await client.query(
    "DELETE FROM cart WHERE user_uuid = $1 AND item_uuid = $2::uuid",
    [userUuid, productId],
  );

  res.json({ message: "Product removed from cart successfully" });
});

app.get("/products/:search?", async (req, res) => {
  const client = await pool.connect();
  const { search } = req.params;

  try {
    let result;
    if (search && search.trim() !== "") {
      result = await client.query(
        "SELECT * FROM products WHERE product_name ILIKE $1",
        [`%${search}%`],
      );
    } else {
      result = await client.query("SELECT * FROM products");
    }

    res.json(result.rows);
  } catch (err) {
    console.error("Error getting products:", err);
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

app.get("/get_cart", authenticateToken, async (req, res) => {
  const email = req.cookies.email;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

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
    client.release();
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
      "SELECT email, role, color FROM users WHERE user_uuid = $1",
      [user_uuid],
    );
    return (
      {
        email: result.rows[0]?.email,
        role: result.rows[0]?.role,
        color: result.rows[0]?.color,
      } || null
    );
  } catch (err) {
    console.error("Error getting email");
    return null;
  } finally {
    client.release();
  }
}

app.get("/comments/:id", async (req, res) => {
  const { id } = req.params;

  const productUUID = await getProductUUID(id);

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
        const data = await getEmailByUserUUID(comment.user_uuid);
        const email = await data.email;
        const role = await data.role;
        const color = await data.color;

        return { ...comment, email, role, color };
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

app.post("/add_comments/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
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
        const data = await getEmailByUserUUID(comment.user_uuid);
        const email = await data.email;
        const role = await data.role;
        const color = await data.color;

        return { ...comment, email, role, color };
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

app.get("/profile", authenticateToken, async (req, res) => {
  const email = req.cookies.email;

  if (!email) {
    return res.status(400).json({ error: "Email not found in cookies" });
  }

  if (!email) {
    return res.status(401).json({ error: "Not authorized" });
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
});

app.put("/profile", authenticateToken, async (req, res) => {
  const email = req.cookies.email;

  if (!email) {
    return res.status(401).json({ error: "Not authorized" });
  }

  const { phone, address } = req.body;

  if (!phone || !address) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const client = await pool.connect();

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
});

app.post("/checkout", authenticateToken, async (req, res) => {
  const { email, cartItems, cardNumber } = req.body;

  console.log("Received request for checkout:", {
    email,
    cartItems,
    cardNumber,
  });

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
    const client = await pool.connect();

    const userResult = await client.query(
      "SELECT user_uuid FROM users WHERE email = $1",
      [email],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userUuid = userResult.rows[0].user_uuid;

    const totalPrice = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const orderResult = await client.query(
      "INSERT INTO orders (user_uuid, total_price, order_status, cart_data, credit_card) VALUES ($1, $2, $3, $4, $5) RETURNING order_uuid",
      [userUuid, totalPrice, "Pending", JSON.stringify(cartItems), cardNumber],
    );
    const orderUuid = orderResult.rows[0].order_uuid;

    await client.query("DELETE FROM cart WHERE user_uuid = $1", [userUuid]);

    res.status(200).json({
      message: "Order placed successfully",
      orderUuid: orderUuid,
    });
  } catch (err) {
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

app.get("/orders", authenticateToken, async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(401).json({ error: "Not authorized" });
  }

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
});

app.post("/products", authenticateToken, async (req, res) => {
  const {
    product_name,
    product_description,
    price,
    type,
    quantity,
    discount,
    img,
    mark,
    category,
  } = req.body;

  if (
    !product_name ||
    !price ||
    !type ||
    !quantity ||
    !discount ||
    !img ||
    !mark ||
    !category
  ) {
    return res
      .status(400)
      .json({ error: "All required fields must be provided." });
  }

  try {
    const query = `
            INSERT INTO products 
            (product_name, product_description, price, type, quantity, discount, img, mark, category)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *;
        `;
    const values = [
      product_name,
      product_description,
      price,
      type,
      quantity,
      discount,
      img,
      mark,
      category,
    ];

    const result = await pool.query(query, values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error inserting product:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/isAdmin", async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: "Please enter a valid email" });
  }

  if (email === "notEmail") {
    return res.status(200).json({ error: "Not authorized", role: "customer" });
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      "SELECT role FROM users WHERE email = $1",
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        error: "User not found or no role assigned",
        role: "customer",
      });
    }

    res.status(200).json({ role: result.rows[0].role });
  } catch (err) {
    console.error("Error fetching user role:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.get("/messages", authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query("SELECT * FROM messages");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/messages", async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      `INSERT INTO messages (name, email, subject, message) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [name, email, subject, message],
    );

    res.status(201).json({
      message: "Message successfully saved",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error saving message:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.delete("/messages/:id", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  const { id } = req.params;

  try {
    const result = await client.query("DELETE FROM messages WHERE id = $1", [
      id,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Сообщение не найдено." });
    }
    res.status(200).json({ message: "Сообщение успешно удалено." });
  } catch (err) {
    console.error("Error deleting message:", err);
    res.status(500).json({ error: "Internal server error." });
  } finally {
    client.release();
  }
});

app.get("/users", authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query("SELECT * FROM users");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.post("/rateProduct", authenticateToken, async (req, res) => {
  try {
    const { productId, rating, email } = req.body;
    if (!email || !productId || !rating) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const userRatingCheck = await pool.query(
      "SELECT * FROM ratings WHERE product_uuid = $1 AND user_email = $2",
      [productId, email],
    );

    if (userRatingCheck.rows.length > 0) {
      await pool.query(
        "UPDATE ratings SET rating = $1 WHERE product_uuid = $2 AND user_email = $3",
        [rating, productId, email],
      );
    } else {
      await pool.query(
        "INSERT INTO ratings (product_uuid, user_email, rating) VALUES ($1, $2, $3)",
        [productId, email, rating],
      );
    }

    const ratingsResult = await pool.query(
      "SELECT rating FROM ratings WHERE product_uuid = $1",
      [productId],
    );

    const allRatings = ratingsResult.rows.map((row) => row.rating);
    const sumOfRatings = allRatings.reduce((acc, val) => acc + val, 0);
    const newAverageRating = sumOfRatings / allRatings.length;

    const result = await pool.query(
      "UPDATE products SET rate = $1 WHERE product_uuid = $2",
      [newAverageRating, productId],
    );

    if (result.rowCount > 0) {
      res
        .status(200)
        .json({ message: "Rating updated successfully", newAverageRating });
    } else {
      res.status(404).json({ error: "Product not found" });
    }
  } catch (error) {
    console.error("Error updating rating:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/admin/products", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT product_id, product_name, product_description, price, img 
       FROM products 
       ORDER BY product_id`,
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/admin/project/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const projectResult = await pool.query(
      "SELECT * FROM products WHERE product_id = $1",
      [id],
    );

    if (projectResult.rows.length > 0) {
      res.status(200).json(projectResult.rows[0]);
    } else {
      res.status(404).json({ error: "Project not found" });
    }
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.put("/admin/project/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { product_name, product_description, price, img } = req.body;

    const result = await pool.query(
      `UPDATE products 
       SET product_name = $1, 
           product_description = $2, 
           price = $3, 
           img = $4, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE product_id = $5`,
      [product_name, product_description, price, img, id],
    );

    if (result.rowCount > 0) {
      res.status(200).json({ message: "Project updated successfully" });
    } else {
      res.status(404).json({ error: "Project not found" });
    }
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const server = app.listen(8000, () => {
  console.log("Server is running on port 8000");
});

server.setTimeout(0);
