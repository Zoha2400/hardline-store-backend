import express from 'express';
import validator from 'validator';
import { pool} from "./database/db.js";

const app = express();

app.use(express.json());


app.get('/', (req, res) => {
    res.json("success",)
});

app.post('/reg', async (req, res) =>  {
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
        const result = await client.query(
            'INSERT INTO users (user_name, password, email) VALUES ($1, $2, $3) RETURNING *',
            [username, password, email]
        );

        return res.status(201).json({
            message: 'User created successfully',
            user: result.rows[0]
        });
    } catch (err) {
        console.error('Error creating user', err);
        return res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});
app.listen(8000, () => {
    console.log('Server is running on port 8000');
});