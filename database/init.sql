DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    user_uuid UUID DEFAULT uuid_generate_v4() NOT NULL UNIQUE,
    password VARCHAR(200) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    role VARCHAR(50) NOT NULL DEFAULT 'customer',
    phone VARCHAR(100) NOT NULL DEFAULT '',
    address VARCHAR(100) NOT NULL DEFAULT '',
    color VARCHAR(10) NOT NULL DEFAULT ''
    );


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
    img VARCHAR(300) NOT NULL,
    rate INTEGER DEFAULT 0,
    mark VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL
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

CREATE TABLE IF NOT EXISTS cart (
    cart_id SERIAL PRIMARY KEY,
    cart_uuid UUID DEFAULT uuid_generate_v4() NOT NULL,
    user_uuid UUID NOT NULL,
    item_uuid UUID NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_uuid) REFERENCES users(user_uuid),
    FOREIGN KEY (item_uuid) REFERENCES products(product_uuid)
);

CREATE TABLE IF NOT EXISTS messages
(
    id         SERIAL PRIMARY KEY,
    name       TEXT    NOT NULL,
    email      TEXT    NOT NULL,
    subject    TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

create unique index cart_user_item_idx
    on cart (user_uuid, item_uuid);




UPDATE products
SET rate = (
    SELECT ROUND(AVG(rating), 1)  -- Calculate the average rating, rounded to 1 decimal place
    FROM ratings
    WHERE product_uuid = products.product_uuid
)
WHERE EXISTS (
    SELECT 1
    FROM ratings
    WHERE product_uuid = products.product_uuid
);


create table ratings
(
    rating_id   serial primary key,
    product_uuid uuid references products(product_uuid),
    user_email   varchar(100) not null,
    rating       int check(rating >= 1 and rating <= 5), -- rating between 1 to 5
    created_at timestamp default CURRENT_TIMESTAMP
);

alter table products
    owner to tuit;


ALTER TABLE products
    ALTER COLUMN rate TYPE float;
