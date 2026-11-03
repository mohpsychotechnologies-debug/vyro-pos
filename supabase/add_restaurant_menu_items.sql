-- Add sample restaurant menu items for hotel stores
-- Run this for Vyro Store and CLARION HOTEL

-- For Vyro Store (7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916)
INSERT INTO products (store_id, name, category, price, stock, barcode) VALUES
-- Main Courses
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Grilled Chicken', 'Main Course', 15000, 50, 'GRILL001'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Beef Steak', 'Main Course', 25000, 30, 'BEEF001'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Fish & Chips', 'Main Course', 18000, 40, 'FISH001'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Chicken Curry', 'Main Course', 14000, 45, 'CURRY001'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Pasta Carbonara', 'Main Course', 16000, 35, 'PASTA001'),

-- Pizzas
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Margherita Pizza', 'Pizza', 12000, 60, 'PIZZA001'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Pepperoni Pizza', 'Pizza', 15000, 55, 'PIZZA002'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Hawaiian Pizza', 'Pizza', 14000, 50, 'PIZZA003'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'BBQ Chicken Pizza', 'Pizza', 16000, 45, 'PIZZA004'),

-- Burgers
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Classic Burger', 'Burger', 8000, 70, 'BURG001'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Cheese Burger', 'Burger', 9000, 65, 'BURG002'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Chicken Burger', 'Burger', 10000, 60, 'BURG003'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Veggie Burger', 'Burger', 7500, 55, 'BURG004'),

-- Sides
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'French Fries', 'Sides', 3000, 100, 'SIDE001'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Onion Rings', 'Sides', 3500, 80, 'SIDE002'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Coleslaw', 'Sides', 2500, 75, 'SIDE003'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Garlic Bread', 'Sides', 4000, 70, 'SIDE004'),

-- Beverages
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Coca Cola', 'Beverage', 2000, 150, 'DRINK001'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Pepsi', 'Beverage', 2000, 150, 'DRINK002'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Sprite', 'Beverage', 2000, 140, 'DRINK003'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Fresh Orange Juice', 'Beverage', 4000, 100, 'DRINK004'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Mineral Water', 'Beverage', 1500, 200, 'DRINK005'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Coffee', 'Beverage', 3000, 120, 'DRINK006'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Tea', 'Beverage', 2500, 130, 'DRINK007'),

-- Desserts
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Chocolate Cake', 'Dessert', 5000, 40, 'DESS001'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Ice Cream', 'Dessert', 3500, 60, 'DESS002'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Fruit Salad', 'Dessert', 4000, 50, 'DESS003'),
('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', 'Cheesecake', 'Dessert', 5500, 35, 'DESS004');


-- For CLARION HOTEL (9675a9a9-4b92-48cd-94f8-66da6d76f5b4)
INSERT INTO products (store_id, name, category, price, stock, barcode) VALUES
-- Main Courses
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Grilled Chicken', 'Main Course', 15000, 50, 'GRILL001'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Beef Steak', 'Main Course', 25000, 30, 'BEEF001'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Fish & Chips', 'Main Course', 18000, 40, 'FISH001'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Chicken Curry', 'Main Course', 14000, 45, 'CURRY001'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Pasta Carbonara', 'Main Course', 16000, 35, 'PASTA001'),

-- Pizzas
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Margherita Pizza', 'Pizza', 12000, 60, 'PIZZA001'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Pepperoni Pizza', 'Pizza', 15000, 55, 'PIZZA002'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Hawaiian Pizza', 'Pizza', 14000, 50, 'PIZZA003'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'BBQ Chicken Pizza', 'Pizza', 16000, 45, 'PIZZA004'),

-- Burgers
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Classic Burger', 'Burger', 8000, 70, 'BURG001'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Cheese Burger', 'Burger', 9000, 65, 'BURG002'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Chicken Burger', 'Burger', 10000, 60, 'BURG003'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Veggie Burger', 'Burger', 7500, 55, 'BURG004'),

-- Sides
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'French Fries', 'Sides', 3000, 100, 'SIDE001'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Onion Rings', 'Sides', 3500, 80, 'SIDE002'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Coleslaw', 'Sides', 2500, 75, 'SIDE003'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Garlic Bread', 'Sides', 4000, 70, 'SIDE004'),

-- Beverages
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Coca Cola', 'Beverage', 2000, 150, 'DRINK001'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Pepsi', 'Beverage', 2000, 150, 'DRINK002'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Sprite', 'Beverage', 2000, 140, 'DRINK003'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Fresh Orange Juice', 'Beverage', 4000, 100, 'DRINK004'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Mineral Water', 'Beverage', 1500, 200, 'DRINK005'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Coffee', 'Beverage', 3000, 120, 'DRINK006'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Tea', 'Beverage', 2500, 130, 'DRINK007'),

-- Desserts
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Chocolate Cake', 'Dessert', 5000, 40, 'DESS001'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Ice Cream', 'Dessert', 3500, 60, 'DESS002'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Fruit Salad', 'Dessert', 4000, 50, 'DESS003'),
('9675a9a9-4b92-48cd-94f8-66da6d76f5b4', 'Cheesecake', 'Dessert', 5500, 35, 'DESS004');

-- Verify the items were added
SELECT store_id, name, category, price FROM products 
WHERE store_id IN ('7c9a9ef5-73f4-4b3b-a59e-7dfb813a9916', '9675a9a9-4b92-48cd-94f8-66da6d76f5b4')
ORDER BY store_id, category, name;
