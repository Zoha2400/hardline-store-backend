DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    user_uuid UUID DEFAULT uuid_generate_v4() NOT NULL UNIQUE,
    username VARCHAR(60) NOT NULL,
    password VARCHAR(200) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    role VARCHAR(50) NOT NULL DEFAULT 'customer',
    phone VARCHAR(100) NOT NULL DEFAULT '',
    adress VARCHAR(100) NOT NULL DEFAULT ''
    );


CREATE TABLE IF NOT EXISTS cart (
    cart_id SERIAL PRIMARY KEY,
    cart_uuid UUID DEFAULT uuid_generate_v4() NOT NULL,
    user_uuid UUID NOT NULL,
    item_uuid UUID NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_uuid) REFERENCES users(user_uuid)
);

CREATE INDEX IF NOT EXISTS idx_cart_user ON cart(user_uuid);
CREATE INDEX IF NOT EXISTS idx_cart_item ON cart(item_uuid);
CREATE INDEX IF NOT EXISTS idx_cart_cartuuid ON cart(cart_uuid);


CREATE TABLE IF NOT EXISTS products (
    product_id SERIAL PRIMARY KEY,
    product_uuid UUID DEFAULT uuid_generate_v4() NOT NULL UNIQUE ,
    product_name VARCHAR(100) NOT NULL,
    product_description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    type VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    discount DECIMAL(10, 2) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    img VARCHAR(300) NOT NULL
    );


CREATE TABLE IF NOT EXISTS orders (
    order_id SERIAL PRIMARY KEY,
    user_uuid UUID NOT NULL,
    order_uuid UUID DEFAULT uuid_generate_v4() NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    order_status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_uuid) REFERENCES users(user_uuid)
);


CREATE TABLE IF NOT EXISTS comments (
    comment_id SERIAL PRIMARY KEY,
    product_uuid UUID NOT NULL,
    user_uuid UUID NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_uuid) REFERENCES products(product_uuid),
    FOREIGN KEY (user_uuid) REFERENCES users(user_uuid)
);