import React, { useState } from 'react';
import { X, Minus, Plus, CreditCard, CheckCircle, ShoppingBag, Smartphone } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { placeOrder, initiatePayment } from '../services/api';

// Simulated STK push steps shown while "paying"
const PAY_STEPS = [
  { key: 'send',  label: 'Sending payment request' },
  { key: 'stk',   label: 'Waiting for your M-Pesa PIN' },
  { key: 'check', label: 'Confirming with PayHero' },
];

const CartDrawer = () => {
  const { cart, cartTotal, cartCount, isCartOpen, setIsCartOpen, removeFromCart, updateQuantity, clearCart } = useCart();
  const { user } = useAuth();
  const { addToast } = useToast();

  // step: 'cart' | 'guest-details' | 'paying' | 'success'
  const [step, setStep] = useState('cart');
  const [payStep, setPayStep] = useState('send');
  const [guestData, setGuestData] = useState({ firstName: '', lastName: '', phone: '' });
  const [receipt, setReceipt] = useState(null);
  const [payPhone, setPayPhone] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isCartOpen) return null;

  const close = () => { setIsCartOpen(false); setStep('cart'); setPayStep('send'); };

  const maskPhone = (p) => (p && p.length >= 9 ? `${p.slice(0, 5)}***${p.slice(-3)}` : p || '');

  const handleProceed = () => {
    if (cart.length === 0) return;
    if (user?.role === 'guest') {
      setStep('guest-details');
    } else {
      runPayment(null);
    }
  };

  const runPayment = async (guestInfo) => {
    setStep('paying');
    setLoading(true);
    try {
      const items = cart.map((i) => ({ meal_id: i.id, quantity: i.orderQuantity }));
      const phone = guestInfo?.phone || user?.phone || '0700000000';
      setPayPhone(phone);
      const guest_name = guestInfo ? `${guestInfo.firstName} ${guestInfo.lastName}` : null;
      const email = user?.email || 'guest@cafeteria.com';

      // 1. Trigger the (possibly simulated) M-Pesa STK push
      setPayStep('send');
      const payRes = await initiatePayment({ amount: cartTotal, phone, customer_name: guest_name || user?.name, email });
      const reference = payRes.data.reference;

      // 2. Customer "enters" their PIN — brief dramatic pause for realism
      await new Promise((r) => setTimeout(r, 1600));
      setPayStep('stk');
      await new Promise((r) => setTimeout(r, 1800));

      // 3. Verify & record the order server-side
      setPayStep('check');
      const orderRes = await placeOrder({
        items,
        guest_name,
        phone_number: phone,
        payment_reference: reference,
        email,
      });

      clearCart();
      setReceipt({
        orderId: orderRes.data?.id,
        total: cartTotal,
        reference,
        simulated: Boolean(payRes.simulated),
      });
      setStep('success');
      addToast('Payment received. Order sent to the kitchen!', 'success');
    } catch (err) {
      setStep(user?.role === 'guest' ? 'guest-details' : 'cart');
      addToast(err.message || 'Payment failed. Try again.', 'error');
    } finally {
      setLoading(false);
      setPayStep('send');
    }
  };

  const handleGuestSubmit = (e) => {
    e.preventDefault();
    if (!guestData.firstName || !guestData.lastName || !guestData.phone) {
      addToast('Please fill in all fields', 'error');
      return;
    }
    runPayment(guestData);
  };

  return (
    <>
      <div className="cart-overlay" onClick={close} />
      <div className="cart-drawer">
        {/* Header */}
        <div className="cart-drawer-header">
          {step === 'cart' && (
            <>
              <div>
                <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Your Cart</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {cartCount} item{cartCount !== 1 ? 's' : ''}
                </p>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={close}><X size={20} /></button>
            </>
          )}
          {step === 'guest-details' && (
            <>
              <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Your Details</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setStep('cart')}><X size={20} /></button>
            </>
          )}
          {(step === 'paying' || step === 'success') && (
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
              {step === 'paying' ? 'Processing Payment' : 'Order Confirmed'}
            </h2>
          )}
        </div>

        {/* Body */}
        <div className="cart-drawer-body">
          {/* Cart Items */}
          {step === 'cart' && (
            cart.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><ShoppingBag size={48} /></div>
                <h3>Cart is empty</h3>
                <p>Add meals from the menu to get started.</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="cart-item">
                  <img src={item.image_url} alt={item.name} className="cart-item-img"
                    onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=100&q=60'; }} />
                  <div className="cart-item-info">
                    <p className="cart-item-name">{item.name}</p>
                    <p className="cart-item-price">KES {Number(item.price).toLocaleString()}</p>
                    <div className="qty-controls">
                      <button className="qty-btn" onClick={() => updateQuantity(item.id, item.orderQuantity - 1)}>
                        <Minus size={14} />
                      </button>
                      <span className="qty-value">{item.orderQuantity}</span>
                      <button className="qty-btn" onClick={() => updateQuantity(item.id, item.orderQuantity + 1)}>
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-icon" onClick={() => removeFromCart(item.id)}
                    style={{ color: 'var(--red)' }}><X size={16} /></button>
                </div>
              ))
            )
          )}

          {/* Guest Details Form */}
          {step === 'guest-details' && (
            <form id="guest-details-form" onSubmit={handleGuestSubmit}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                Please enter your details so our staff can identify your order.
              </p>
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input className="form-input" type="text" placeholder="e.g. John" required
                  value={guestData.firstName} onChange={(e) => setGuestData({ ...guestData, firstName: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input className="form-input" type="text" placeholder="e.g. Kamau" required
                  value={guestData.lastName} onChange={(e) => setGuestData({ ...guestData, lastName: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">M-Pesa Phone Number</label>
                <input className="form-input" type="tel" placeholder="e.g. 0712345678" required
                  value={guestData.phone} onChange={(e) => setGuestData({ ...guestData, phone: e.target.value })} />
              </div>
            </form>
          )}

          {/* Paying State — simulated STK push journey */}
          {step === 'paying' && (
            <div className="pay-stage">
              <Smartphone size={40} color="var(--accent)" strokeWidth={1.6} />
              <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1rem', marginTop: '0.75rem' }}>
                KES {cartTotal.toLocaleString()}
              </p>
              <div className="pay-phone-chip">
                {maskPhone(payPhone)}
              </div>
              <div className="pay-steps">
                {PAY_STEPS.map((s) => {
                  const currentIndex = PAY_STEPS.findIndex((x) => x.key === payStep);
                  const idx = PAY_STEPS.findIndex((x) => x.key === s.key);
                  const state = idx < currentIndex ? 'done' : idx === currentIndex ? 'active' : '';
                  return (
                    <div key={s.key} className={`pay-step ${state}`}>
                      <span className="pay-step-dot">{state === 'done' ? '✓' : ''}</span>
                      {s.label}{state === 'active' ? '…' : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Success State */}
          {step === 'success' && (
            <div className="pay-stage">
              <div style={{ width: 76, height: 76, background: 'var(--green-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={38} color="var(--green)" />
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--green)', margin: '1rem 0 0.25rem', fontSize: '1.3rem' }}>Payment Received</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: 280 }}>
                Your order has been sent to the kitchen. Show the order number at the counter when collecting.
              </p>
              <div className="pay-receipt">
                <div className="pay-receipt-row"><span>Order No.</span><strong>#{String(receipt?.orderId ?? '—').padStart(4, '0')}</strong></div>
                <div className="pay-receipt-row"><span>Amount</span><strong>KES {Number(receipt?.total || 0).toLocaleString()}</strong></div>
                <div className="pay-receipt-row"><span>Method</span><strong>M-Pesa{receipt?.simulated ? ' (simulated)' : ''}</strong></div>
                <div className="pay-receipt-row"><span>Ref</span><strong style={{ fontSize: '0.72rem' }}>{receipt?.reference}</strong></div>
              </div>
              <button className="btn btn-primary btn-full" style={{ marginTop: '1.5rem' }} onClick={close}>
                Back to Menu
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'cart' || step === 'guest-details') && cart.length > 0 && (
          <div className="cart-drawer-footer">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 700, fontSize: '1.05rem' }}>
              <span>Total</span>
              <span>KES {cartTotal.toLocaleString()}</span>
            </div>
            {step === 'cart' ? (
              <button id="cart-checkout-btn" className="btn btn-primary btn-full btn-lg" onClick={handleProceed}>
                <CreditCard size={17} />
                Pay with M-Pesa
              </button>
            ) : (
              <button form="guest-details-form" type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
                <CreditCard size={17} />
                {loading ? 'Processing…' : `Pay KES ${cartTotal.toLocaleString()}`}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default CartDrawer;
