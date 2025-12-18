import Agent from '../models/agent.model.js';

// Generate a unique username based on agency name
export const generateUsername = async (agencyName) => {
  const generateBase = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove special characters
      .slice(0, 8); // Take first 8 characters
  };

  let username;
  let isUnique = false;
  let counter = 0;

  while (!isUnique) {
    // Generate username with counter
    username = counter === 0 ? 
      generateBase(agencyName) : 
      `${generateBase(agencyName)}${counter}`;

    // Check if username exists
    const existingUser = await Agent.findOne({ username });
    if (!existingUser) {
      isUnique = true;
    } else {
      counter++;
    }
  }

  return username;
};

// Generate a random password
export const generatePassword = () => {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  
  return password;
}; 