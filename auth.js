import validator from "validator";
import { pool } from "./database/db.js";
import bcrypt from "bcryptjs";
import { jwtCreate } from "./jwt.js";
import getRandomBrightColor from "./funcs.js";

export async function reg(req, res) {
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
    const color = getRandomBrightColor();

    const result = await client.query(
      "INSERT INTO users (password, email, color) VALUES ($1, $2, $3) RETURNING *",
      [passwordHash, email, color],
    );

    const token = jwtCreate(result.rows[0].id, result.rows[0].email);

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
}

export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Email is not valid" });
  }

  let client;
  try {
    client = await pool.connect();

    const result = await client.query(
      "SELECT user_id, email, password FROM users WHERE email = $1",
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { id, password: hashedPassword } = result.rows[0];

    const isRealPassword = await bcrypt.compare(password, hashedPassword);

    if (!isRealPassword) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const token = jwtCreate(id, email);

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

    return res.status(200).json({
      message: "Logged In Successfully",
      data: { email },
    });
  } catch (err) {
    console.error("Error during login", err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (client) client.release();
  }
}
