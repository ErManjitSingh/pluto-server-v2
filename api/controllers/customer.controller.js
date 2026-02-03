import CustomerData from "../models/customer.model.js";

export const createCustomerData = async (req, res) => {
  try {
    const customer = await CustomerData.create(req.body);
    return res.status(201).json(customer);
  } catch (error) {
    return res.status(400).json({ message: "Failed to create customer data", error: error.message });
  }
};

export const getCustomerData = async (req, res) => {
  try {
    const customers = await CustomerData.find().sort({ createdAt: -1 });
    return res.status(200).json(customers);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch customer data", error: error.message });
  }
};

export const getCustomerDataById = async (req, res) => {
  try {
    const customer = await CustomerData.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer data not found" });
    }
    return res.status(200).json(customer);
  } catch (error) {
    return res.status(400).json({ message: "Failed to fetch customer data", error: error.message });
  }
};

export const updateCustomerData = async (req, res) => {
  try {
    const customer = await CustomerData.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!customer) {
      return res.status(404).json({ message: "Customer data not found" });
    }
    return res.status(200).json(customer);
  } catch (error) {
    return res.status(400).json({ message: "Failed to update customer data", error: error.message });
  }
};

export const deleteCustomerData = async (req, res) => {
  try {
    const customer = await CustomerData.findByIdAndDelete(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer data not found" });
    }
    return res.status(200).json({ message: "Customer data deleted successfully" });
  } catch (error) {
    return res.status(400).json({ message: "Failed to delete customer data", error: error.message });
  }
};

