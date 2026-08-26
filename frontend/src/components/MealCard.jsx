import React from 'react';
import { useCart } from '../context/CartContext';
import { Plus, ShoppingCart, Heart } from 'lucide-react';

const categoryStyles = {
  breakfast: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Breakfast' },
  lunch:     { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Lunch' },
  supper:    { bg: 'rgba(139,92,246,0.15)', color: '#a78bfa', label: 'Supper' },
};

const MealCard = ({ meal, isFavourite, onToggleFavourite }) => {
  const { addToCart, cart } = useCart();
  const inCart = cart.find((i) => i.id === meal.id);
  const isAvailable = meal.availability && meal.quantity_available > 0;
  const catStyle = categoryStyles[meal.category] || categoryStyles.lunch;

  return (
    <div className="meal-card">
      <div className="meal-card-img-wrapper">
        <img
          src={meal.image_url || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80'}
          alt={meal.name}
          className="meal-card-img"
          onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80'; }}
        />
        <span className="meal-card-category-badge" style={{ background: catStyle.bg, color: catStyle.color }}>
          {catStyle.label}
        </span>
        {onToggleFavourite && (
          <button
            onClick={() => onToggleFavourite(meal)}
            title={isFavourite ? 'Remove from favourites' : 'Save to favourites'}
            style={{
              position: 'absolute', top: '0.6rem', right: '0.6rem',
              width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
              transition: 'transform 0.15s',
            }}
          >
            <Heart size={17} fill={isFavourite ? '#f43f5e' : 'none'} color={isFavourite ? '#f43f5e' : '#fff'} />
          </button>
        )}
        {Number(meal.avg_rating) > 0 && (
          <span style={{
            position: 'absolute', bottom: '0.6rem', left: '0.6rem',
            background: 'rgba(0,0,0,0.55)', color: '#fbbf24', fontWeight: 700,
            fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '1rem',
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
          }}>
            ★ {meal.avg_rating}
          </span>
        )}
        {!isAvailable && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: '1.2rem', background: 'rgba(0,0,0,0.7)', padding: '0.5rem 1rem', borderRadius: '0.5rem' }}>
              Sold Out
            </span>
          </div>
        )}
      </div>

      <div className="meal-card-body">
        <h3 className="meal-card-name">{meal.name}</h3>
        <p className="meal-card-desc">{meal.description}</p>

        <div className="meal-card-footer">
          <div>
            <div className="meal-price">KES {Number(meal.price).toLocaleString()}</div>
            <div className={`meal-qty ${!isAvailable ? 'meal-sold-out' : ''}`}>
              {isAvailable ? `${meal.quantity_available} left` : 'Unavailable'}
            </div>
          </div>

          <button
            id={`add-to-cart-${meal.id}`}
            className="btn btn-primary btn-icon"
            style={{ padding: '0.55rem 1rem', gap: '0.4rem' }}
            disabled={!isAvailable}
            onClick={() => addToCart(meal)}
            title={isAvailable ? `Add ${meal.name} to cart` : 'Sold out'}
          >
            {inCart ? (
              <>
                <ShoppingCart size={16} />
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{inCart.orderQuantity}</span>
              </>
            ) : (
              <Plus size={18} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MealCard;
