import React, { createContext, useState, useContext } from 'react';

export const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const addToCart = (meal) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === meal.id);
      if (existing) {
        return prev.map((i) =>
          i.id === meal.id ? { ...i, orderQuantity: i.orderQuantity + 1 } : i
        );
      }
      return [...prev, { ...meal, orderQuantity: 1 }];
    });
  };

  const removeFromCart = (id) => setCart((prev) => prev.filter((i) => i.id !== id));

  const updateQuantity = (id, quantity) => {
    if (quantity <= 0) { removeFromCart(id); return; }
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, orderQuantity: quantity } : i)));
  };

  const clearCart = () => setCart([]);

  const cartTotal = cart.reduce((total, i) => total + i.price * i.orderQuantity, 0);
  const cartCount = cart.reduce((total, i) => total + i.orderQuantity, 0);

  return (
    <CartContext.Provider value={{ cart, cartTotal, cartCount, isCartOpen, setIsCartOpen, addToCart, removeFromCart, updateQuantity, clearCart }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
