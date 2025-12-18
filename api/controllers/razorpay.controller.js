import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: "rzp_test_HUp5emZ4E3RHU3", // Replace with your Razorpay key_id
  key_secret: "AfoWLa4i9pzjnXMb2aNubUvX", // Replace with your Razorpay key_secret
});


export const makePayment = async (req, res) => {
  console.log(req.body)
  const orderOptions = {
    amount: req.body.totalPrice, // amount in paisa
    currency: 'INR',
    receipt: 'order_receipt_id_' + Date.now(),
  };

  try {
    const order = await razorpay.orders.create(orderOptions);
    res.json(order);
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
  