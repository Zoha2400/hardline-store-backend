import express from 'express';
import validator from 'validator';
import { pool} from "./database/db.js";
import bcrypt from 'bcryptjs';
import cors from 'cors'
import jwt from 'jsonwebtoken'

const app = express();

app.use(express.json());
app.use(cors())

app.get('/', (req, res) => {
    res.json("success",)
});


app.post('/reg', async (req, res) => {
    const secretKey = 'yourSecretKey';

    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (!validator.isEmail(email)) {
        return res.status(400).json({ error: 'Email is not valid' });
    }

    if (!validator.isStrongPassword(password)) {
        return res.status(400).json({
            error: 'Password is not strong enough. { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 }'
        });
    }

    const client = await pool.connect();

    try {
        const passwordHash = await bcrypt.hash(password, 10);

        const result = await client.query(
            'INSERT INTO users (user_name, password, email) VALUES ($1, $2, $3) RETURNING *',
            [username, passwordHash, email]
        );

        const token = jwt.sign(
            { id: result.rows[0].id, username: result.rows[0].user_name },
            secretKey,
            { expiresIn: '24h' } // Токен действителен 1 час
        );



        return res.status(201).json({
            message: 'User created successfully',
            data: { token: token, email: result.rows[0].email }
        });
    } catch (err) {
        console.error('Error creating user:', err);

        if (err.code === '23505') {
            return res.status(409).json({ error: 'Email already exists' });
        }

        return res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (!validator.isEmail(email)) {
        return res.status(400).json({ error: 'Email is not valid' });
    }

    const client = await pool.connect();

    try {
        const result = await client.query('SELECT password FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const hashedPassword = result.rows[0].password;

        const isRealPassword = await bcrypt.compare(password, hashedPassword);

        if (isRealPassword) {
            res.cookie('client', JSON.stringify({ email }), { httpOnly: true });
            return res.json({ message: 'Logged In Successfully' });
        } else {
            return res.status(401).json({ error: 'Invalid password' });
        }
    } catch (err) {
        console.error('Error during login', err);
        return res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});


app.get('/products', async (req, res) => {
    const client = await pool.connect();

    try {
        const result = await client.query('SELECT * FROM products');
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting users:', err);
        res.status(500).json({ error: 'Server error' });
    }
})

app.get('/product/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        const result = await client.query('SELECT * FROM products WHERE product_id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error getting product:', err);
        res.status(500).json({ error: 'Server error' });
    }
})

app.listen(8000, () => {
    console.log('Server is running on port 8000');
});