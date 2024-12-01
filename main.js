import express from 'express';
import validator from 'validator';
import { pool} from "./database/db.js";
import bcrypt from 'bcryptjs';
import cors from 'cors'
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser';



const app = express();

app.use(express.json());
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
}));
app.use(cookieParser());


//  async function connectDB(){
//     try {
//         return await pool.connect();
//     } catch (err) {
//         console.error('Error connecting to the PostgreSQL database', err.stack);
//     }
// }
//
// app.use(connectDB)

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
            'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING *',
            [username, passwordHash, email]
        );

        const token = jwt.sign(
            { id: result.rows[0].id, username: result.rows[0].username },
            secretKey,
            { expiresIn: '24h' } // Токен действителен 1 час
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // только для HTTPS в продакшене
            sameSite: 'Strict',
            maxAge: 24 * 60 * 60 * 1000 // Токен живет 1 день
        });
        res.cookie('email', email, {
            httpOnly: false,  // Это можно сделать доступным для JS, если нужно
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 24 * 60 * 60 * 1000
        });

        return res.status(201).json({
            message: 'User created successfully',
            data: { email: result.rows[0].email }
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
    const secretKey = 'yourSecretKey';

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
            const token = jwt.sign(
                { id: result.rows[0].id, username: result.rows[0].username },
                secretKey,
                { expiresIn: '24h' } // Токен действителен 1 час
            );

            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // только для HTTPS в продакшене
                sameSite: 'Strict',
                maxAge: 24 * 60 * 60 * 1000 // Токен живет 1 день
            });
            res.cookie('email', email, {
                httpOnly: false,  // Это можно сделать доступным для JS, если нужно
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Strict',
                maxAge: 24 * 60 * 60 * 1000
            });

            return res.status(201).json({
                message: 'Logged In Successfully',
                data: { email: email }
            });
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


app.get('/profile', async (req, res) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: 'Not authorized' });
    }

    try {
        const client = await pool.connect();

        const payload = jwt.verify(token, 'yourSecretKey');
        if(payload){
          try {
              const data = await client.query("SELECT email, phone, username, updated_at, adress FROM users WHERE email = $1", [email])
              res.json({
                  username: data.rows[0].username,
                  email: data.rows[0].email,
                  phone: data.rows[0].phone,
                  adress: data.rows[0].adress,
                  updated_at: data.rows[0].updated_at,
              })
          }catch (err) {
              console.error('Error getting user data:', err);
              return res.status(500).json({ error: 'Server error' });
          }
        }
    } catch (err) {
        console.error('Error verifying token:', err);
        res.status(403).json({ error: 'Unauthorized' });
    }
})

app.put('/profile', async (req, res) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: 'Not authorized' });
    }

    const { username, phone, adress } = req.body;

    if (!username || !phone || !adress) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try{
        const client = await pool.connect();
        const payload = jwt.verify(token, 'yourSecretKey');
        if(payload){
          try {
              await client.query("UPDATE users SET username = $1, phone = $2, adress = $3 WHERE email = $4", [username, phone, adress, email])
              res.json({
                  message: 'Profile updated successfully'
              })
          }catch (err) {
              console.error('Error updating user profile:', err);
              return res.status(500).json({ error: 'Server error' });
          }
        }
    }catch (err){
        console.error('Error verifying token:', err);
        res.status(403).json({ error: 'Unauthorized' });
    }
})

app.delete('/logout', (req, res) => {
    const token = req.cookies.token

    if (!token) {
        return res.status(401).json({ error: 'Not authorized' });
    }

    const payload = jwt.verify(token, 'yourSecretKey')

    if(payload){
        res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' });
        res.clearCookie('email', { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' });
        res.json({ message: 'Logged out successfully' });
    }else{
        console.error('Error verifying token:', err);
        res.status(403).json({ error: 'Unauthorized' });
    }
})

app.delete('/delete', async (req, res) => {
    const token = req.cookies.token
    const email = req.cookies.email

    if (!token) {
        return res.status(401).json({ error: 'Not authorized' });
    }

    try{
        const client = await pool.connect();
        const payload = jwt.verify(token, 'yourSecretKey');
        if(payload){
          try {
              await client.query("DELETE FROM users WHERE email = $1", [email])
              res.json({
                  message: 'User deleted successfully'
              })
          }catch (err) {
              console.error('Error deleting user:', err);
              return res.status(500).json({ error: 'Server error' });
          }
        }
    }catch (err){
        console.error('Error verifying token:', err);
        res.status(403).json({ error: 'Unauthorized' });
    }
})

app.post('/addCart', async (req, res) => {
    const token = req.cookies.token; // Получаем токен из cookies
    const email = req.body.email; // Получаем email из тела запроса

    if (!token) {
        return res.status(401).json({ error: 'Not authorized' });
    }

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const { productId, quantity } = req.body;

    if (!productId || !quantity) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const client = await pool.connect(); // Получаем подключение к базе данных

        // Проверяем токен
        const payload = jwt.verify(token, 'yourSecretKey');
        if (!payload) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        try {
            // Получаем user_uuid по email
            const userResult = await client.query('SELECT user_uuid FROM users WHERE email = $1', [email]);

            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const userUuid = userResult.rows[0].user_uuid; // Извлекаем user_uuid

            // Теперь добавляем товар в корзину
            const result = await client.query(
                `INSERT INTO cart (user_uuid, item_uuid, quantity) 
                VALUES ($1, $2, $3) 
                ON CONFLICT (user_uuid, item_uuid) 
                DO UPDATE SET quantity = cart.quantity + EXCLUDED.quantity;`,
                [userUuid, productId, quantity]
            );

            res.json({
                message: 'Product added to cart successfully'
            });

        } catch (err) {
            console.error('Error interacting with database:', err);
            return res.status(500).json({ error: 'Server error' });
        } finally {
            client.release(); // Закрываем подключение к базе данных
        }

    } catch (err) {
        console.error('Error verifying token:', err);
        res.status(403).json({ error: 'Unauthorized' });
    }
});



app.delete('/removeCart', async (req, res) => {
    const token = req.cookies.token; // Получаем токен из cookies
    const email = req.body.email; // Получаем email из тела запроса

    if (!token) {
        return res.status(401).json({ error: 'Not authorized' });
    }

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const { productId } = req.body;

    if (!productId) {
        return res.status(400).json({ error: 'Product ID is required' });
    }

    try {
        const client = await pool.connect(); // Получаем подключение к базе данных

        const payload = jwt.verify(token, 'yourSecretKey');
        if (!payload) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        try {
            // Получаем user_uuid по email
            const userResult = await client.query('SELECT user_uuid FROM users WHERE email = $1', [email]);

            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const userUuid = userResult.rows[0].user_uuid; // Извлекаем user_uuid

            // Проверяем, существует ли товар в корзине
            const cartItemResult = await client.query(
                'SELECT * FROM cart WHERE user_uuid = $1 AND item_uuid = $2',
                [userUuid, productId]
            );

            if (cartItemResult.rows.length === 0) {
                return res.status(404).json({ error: 'Product not found in cart' });
            }

            // Удаляем товар из корзины
            await client.query(
                'DELETE FROM cart WHERE user_uuid = $1 AND item_uuid = $2',
                [userUuid, productId]
            );

            res.json({
                message: 'Product removed from cart successfully'
            });

        } catch (err) {
            console.error('Error interacting with database:', err);
            return res.status(500).json({ error: 'Server error' });
        } finally {
            client.release(); // Закрываем подключение к базе данных
        }

    } catch (err) {
        console.error('Error verifying token:', err);
        res.status(403).json({ error: 'Unauthorized' });
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