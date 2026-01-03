import Operation from '../models/finalcosting.model.js';
import Lead from '../models/lead.model.js';
import CabBooking from '../models/cabbookingdata.model.js';
import nodemailer from 'nodemailer';
import mongoose from 'mongoose';

export const createOperation = async (req, res, next) => {
  try {
    const operation = await Operation.create(req.body);
    res.status(201).json(operation);
  } catch (error) {
    next(error);
  }
};

export const getOperations = async (req, res, next) => {
  try {
    // Get page and limit from query parameters, set defaults if not provided
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    // Get total count of documents
    const total = await Operation.countDocuments();

    // Get paginated operations
    const operations = await Operation.find()
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      operations,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getOperationById = async (req, res, next) => {
  try {
    const { id, userId, customerLeadId } = req.params;
    // Use lean() for faster queries (returns plain JS objects instead of Mongoose documents)
    // Use findOne if only one result is expected, or find with lean for multiple
    const operations = await Operation.find({ id, userId, customerLeadId })
      .lean() // Faster - returns plain objects
      .maxTimeMS(70000); // Set timeout to prevent hanging queries
    
    if (!operations || operations.length === 0) {
      return res.status(404).json({ message: 'Operation not found' });
    }
    
    res.status(200).json(operations);
  } catch (error) {
    next(error);
  }
};

export const deleteOperation = async (req, res, next) => {
  try {
    // Use findByIdAndDelete with lean option for faster deletion
    const deletedOperation = await Operation.findByIdAndDelete(req.params.id, {
      maxTimeMS: 70000 // Set timeout
    });
    
    if (!deletedOperation) {
      return res.status(404).json({ message: 'Operation not found' });
    }
    
    res.status(200).json('Operation has been deleted!');
  } catch (error) {
    next(error);
  }
};

export const updateOperation = async (req, res, next) => {
  try {
      const { hotelDay, updatedHotel } = req.body;
      
      // Find the operation first
      const operation = await Operation.findById(req.params.id);
      if (!operation) {
          return res.status(404).json({ message: 'Operation not found' });
      }

      // Find the index of the hotel to update
      const hotelIndex = operation.hotels.findIndex(h => h.day === hotelDay);

      if (hotelIndex === -1) {
          // If hotel with this day doesn't exist, add it
          operation.hotels.push(updatedHotel);
      } else {
          // Update existing hotel while preserving fields not included in the update
          operation.hotels[hotelIndex] = {
              ...operation.hotels[hotelIndex],
              ...updatedHotel
          };
      }

      // Save the updated operation
      const updatedOperation = await operation.save();
      
      res.status(200).json(updatedOperation);
  } catch (error) {
      next(error);
  }
};

export const updateTransfer = async (req, res, next) => {
  try {
    const operationId = req.params.id;
    const transferUpdates = req.body;

    // Create update object with dot notation for nested fields
    const updateObject = {};
    Object.keys(transferUpdates).forEach(key => {
      updateObject[`transfer.${key}`] = transferUpdates[key];
    });

    const updatedOperation = await Operation.findByIdAndUpdate(
      operationId,
      { $set: updateObject },
      { new: true }
    );
    
    if (!updatedOperation) {
      return res.status(404).json({ message: 'Operation not found' });
    }
    
    res.status(200).json(updatedOperation);
  } catch (error) {
    next(error);
  }
};

export const updateTransferDetailAtIndex = async (req, res, next) => {
  try {
    const operationId = req.params.id;
    const { index, detailData } = req.body;

    if (typeof index !== 'number' || index < 0) {
      return res.status(400).json({ message: 'Invalid index. Must be a non-negative number.' });
    }

    // First, get the current operation to check if it exists and get current details
    const currentOperation = await Operation.findById(operationId);
    if (!currentOperation) {
      return res.status(404).json({ message: 'Operation not found' });
    }

    // Check if transfer.details exists and has the specified index
    if (!currentOperation.transfer || !currentOperation.transfer.details || !Array.isArray(currentOperation.transfer.details)) {
      return res.status(400).json({ message: 'Transfer details not found or not an array' });
    }

    if (index >= currentOperation.transfer.details.length) {
      return res.status(400).json({ message: `Index ${index} is out of bounds. Array has ${currentOperation.transfer.details.length} elements.` });
    }

    // Merge existing data with new data to preserve fields
    const mergedDetail = {
      ...currentOperation.transfer.details[index], // Keep existing fields
      ...detailData // Override with new data
    };

    // Use findByIdAndUpdate with $set to update only the specific transfer detail
    // This avoids triggering validation for the entire document
    const updateQuery = {
      [`transfer.details.${index}`]: mergedDetail
    };

    const updatedOperation = await Operation.findByIdAndUpdate(
      operationId,
      { $set: updateQuery },
      { 
        new: true,
        runValidators: false // Disable validation to avoid acceptanceData issues
      }
    );
    
    res.status(200).json(updatedOperation);
  } catch (error) {
    next(error);
  }
};

export const updateHotelAtIndex = async (req, res, next) => {
  try {
    const operationId = req.params.id;
    const { index, day, hotelData } = req.body;

    // Validate input - either index or day must be provided
    if (typeof index !== 'number' && typeof day !== 'number') {
      return res.status(400).json({ message: 'Either index or day must be provided as a number.' });
    }

    // First, get the current operation to check if it exists and get current hotels
    const currentOperation = await Operation.findById(operationId);
    if (!currentOperation) {
      return res.status(404).json({ message: 'Operation not found' });
    }

    // Check if hotels array exists
    if (!currentOperation.hotels || !Array.isArray(currentOperation.hotels)) {
      return res.status(400).json({ message: 'Hotels array not found' });
    }

    let targetIndex = -1;

    if (typeof index === 'number') {
      // Update by index
      if (index < 0 || index >= currentOperation.hotels.length) {
        return res.status(400).json({ message: `Index ${index} is out of bounds. Array has ${currentOperation.hotels.length} elements.` });
      }
      targetIndex = index;
    } else {
      // Update by day
      targetIndex = currentOperation.hotels.findIndex(hotel => hotel.day === day);
      if (targetIndex === -1) {
        return res.status(404).json({ message: `Hotel with day ${day} not found.` });
      }
    }

    // Merge existing hotel data with new data to preserve fields
    const mergedHotel = {
      ...currentOperation.hotels[targetIndex], // Keep existing fields
      ...hotelData // Override with new data
    };

    // Use findByIdAndUpdate with $set to update only the specific hotel
    // This avoids triggering validation for the entire document
    const updateQuery = {
      [`hotels.${targetIndex}`]: mergedHotel
    };

    const updatedOperation = await Operation.findByIdAndUpdate(
      operationId,
      { $set: updateQuery },
      { 
        new: true,
        runValidators: false // Disable validation to avoid acceptanceData issues
      }
    );
    
    res.status(200).json(updatedOperation);
  } catch (error) {
    next(error);
  }
};

export const updateEntireOperation = async (req, res, next) => {
  try {
    // Disable validation and use $set for atomic updates - much faster
    const updatedOperation = await Operation.findByIdAndUpdate(
      req.params.id,
      { $set: req.body }, // Use $set for atomic update
      { 
        new: true,
        runValidators: false, // Disable validation for faster updates
        lean: false, // Keep as Mongoose document for response
        maxTimeMS: 70000 // Set timeout
      }
    );
    
    if (!updatedOperation) {
      return res.status(404).json({ message: 'Operation not found' });
    }
    
    res.status(200).json(updatedOperation);
  } catch (error) {
    next(error);
  }
};

export const sendOperationEmail = async (req, res, next) => {
  try {
    const { email, operationId, hotelData } = req.body;
    
    // Find the operation
    const operation = await Operation.findById(operationId);
    if (!operation) {
      return res.status(404).json({ message: 'Operation not found' });
    }

    // Find the specific hotel in the operation
    const hotelIndex = operation.hotels.findIndex(h => 
      h.propertyName === hotelData.propertyName && 
      h.cityName === hotelData.cityName && 
      h.day === hotelData.day
    );

    if (hotelIndex === -1) {
      return res.status(404).json({ message: 'Hotel not found in operation' });
    }

    // Create email transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
   port: 465,
  secure: true,
      auth: {
        user: process.env.EMAIL_USER,     // Reservation@ptwholidays.com
        pass: process.env.EMAIL_PASSWORD, // your email password
      }
    });

    // Format dates for display - show check-in and check-out dates
    const datesArray = hotelData.finalBookingData.daysWithDates;
    let checkInDate = '';
    let checkOutDate = '';
    
    if (datesArray && datesArray.length > 0) {
      // First date is check-in
      checkInDate = new Date(datesArray[0].date).toLocaleDateString();
      
      // Last date + 1 day is check-out
      if (datesArray.length > 0) {
        const lastDate = new Date(datesArray[datesArray.length - 1].date);
        lastDate.setDate(lastDate.getDate() + 1);
        checkOutDate = lastDate.toLocaleDateString();
      }
    }

    const datesHtml = `
      <div style="background-color: #f8f9fa; padding: 15px; margin: 5px; border-radius: 5px;">
        <p style="margin: 0;"><strong>Check-in:</strong> ${checkInDate}</p>
        <p style="margin: 0;"><strong>Check-out:</strong> ${checkOutDate}</p>
      </div>
    `;

    // Format hotels data
    const hotelsHtml = hotelData.finalBookingData.hotels
      .map(hotel => `
        <div style="background-color: #f8f9fa; padding: 20px; margin: 10px 0; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
              <p><strong>Day:</strong> ${hotel.day}</p>
              <p><strong>Property Name:</strong> ${hotel.propertyName}</p>
              <p><strong>City:</strong> ${hotel.cityName}</p>
              <p><strong>Room Type:</strong> ${hotel.roomName}</p>
              <p><strong>Meal Plan:</strong> ${hotel.mealPlan}</p>
            </div>
            <div>
              <p><strong>Cost:</strong> ₹${hotel.cost}</p>
              <p><strong>Extra Adult Rate:</strong> ₹${hotel.extraAdultRate}</p>
            </div>
          </div>
        </div>
      `).join('');

    // Send initial email to get messageId
    const initialMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Hotel Booking Request - ${hotelData.propertyName}`,
      text: 'Preparing your hotel booking request...'
    };

    const info = await transporter.sendMail(initialMailOptions);
    const messageId = info.messageId;

    // Create final HTML content with the correct messageId
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="background-color: #003366; color: white; padding: 20px; border-radius: 10px; margin-bottom: 30px;">
          <h1 style="margin: 0;">Hotel Booking Request</h1>
          <p style="margin: 10px 0 0;">Property: ${hotelData.propertyName}</p>
          <p style="margin: 5px 0 0;">City: ${hotelData.cityName}</p>
        </div>

        <div style="background-color: #ffffff; padding: 25px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.1); margin-bottom: 20px;">
          <h2 style="color: #003366; border-bottom: 2px solid #003366; padding-bottom: 10px;">Hotels Information</h2>
          ${hotelsHtml}
        </div>

        <div style="background-color: #ffffff; padding: 25px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.1); margin-bottom: 20px;">
          <h2 style="color: #003366; border-bottom: 2px solid #003366; padding-bottom: 10px;">Stay Details</h2>
          <div style="margin-bottom: 20px;">
            <h3>Selected Dates</h3>
            <div style="display: flex; flex-wrap: wrap;">
              ${datesHtml}
            </div>
          </div>
          
          <div style="margin-bottom: 20px;">
            <h3>Total Amount</h3>
            <p><strong>Total Amount:</strong> ₹${hotelData.finalBookingData.totalAmount}</p>
          </div>
        </div>

        <div style="text-align: center; margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 10px;">
          <p style="font-size: 18px; margin-bottom: 20px;">Please confirm your response to this booking request:</p>
          <a href="https://operation.plutotours.com/api/finalcosting/email-response/${operationId}/accept/${messageId}" 
              style="display: inline-block; background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; margin: 0 10px; border-radius: 5px; font-weight: bold;">
             Accept Booking
          </a>
          <a href="https://operation.plutotours.com/api/finalcosting/email-response/${operationId}/reject/${messageId}"
             style="display: inline-block; background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; margin: 0 10px; border-radius: 5px; font-weight: bold;">
             Reject Booking
          </a>
        </div>
      </div>
    `;

    // Update the email with the complete content
    const finalMailOptions = {
      ...initialMailOptions,
      html: htmlContent,
      text: undefined // Remove the text content
    };

    await transporter.sendMail(finalMailOptions);

    // Update the email status for the specific hotel
    const updateQuery = {};
    updateQuery[`hotels.${hotelIndex}.emailStatus`] = {
      messageId: messageId,
      status: 'sent',
      sentAt: new Date()
    };

    await Operation.findByIdAndUpdate(operationId, {
      $set: updateQuery
    });
    
    res.status(200).json({ message: 'Email sent successfully', messageId: messageId });
  } catch (error) {
    console.error('Email sending error:', error);
    next(error);
  }
};

// New function to send email for multiple hotels in a group
export const sendGroupHotelEmail = async (req, res, next) => {
  try {
    const { email, operationId, hotelGroupData } = req.body;
    
    // Find the operation
    const operation = await Operation.findById(operationId);
    if (!operation) {
      return res.status(404).json({ message: 'Operation not found' });
    }

    // Find all hotels in the group
    const hotelIndices = [];
    for (const hotel of hotelGroupData.hotels) {
      const hotelIndex = operation.hotels.findIndex(h => 
        h.propertyName === hotel.propertyName && 
        h.cityName === hotel.cityName && 
        h.day === hotel.day
      );
      if (hotelIndex !== -1) {
        hotelIndices.push(hotelIndex);
      }
    }

    if (hotelIndices.length === 0) {
      return res.status(404).json({ message: 'No hotels found in operation' });
    }

    // Create email transporter
        const transporter = nodemailer.createTransport({
        host: 'smtp.hostinger.com',
   port: 465,
  secure: true,
      auth: {
        user: process.env.EMAIL_USER,     // Reservation@ptwholidays.com
        pass: process.env.EMAIL_PASSWORD, // your email password
      }
    });

    // Format dates for display - show check-in and check-out dates
    const datesArray = hotelGroupData.daysWithDates;
    let checkInDate = '';
    let checkOutDate = '';
    
    if (datesArray && datesArray.length > 0) {
      // First date is check-in
      checkInDate = new Date(datesArray[0].date).toLocaleDateString();
      
      // Last date + 1 day is check-out
      if (datesArray.length > 0) {
        const lastDate = new Date(datesArray[datesArray.length - 1].date);
        lastDate.setDate(lastDate.getDate() + 1);
        checkOutDate = lastDate.toLocaleDateString();
      }
    }

    const datesHtml = `
      <div style="background-color: #f8f9fa; padding: 15px; margin: 5px; border-radius: 5px;">
        <p style="margin: 0;"><strong>Check-in:</strong> ${checkInDate}</p>
        <p style="margin: 0;"><strong>Check-out:</strong> ${checkOutDate}</p>
      </div>
    `;

    // Format hotels data
    const hotelsHtml = hotelGroupData.hotels
      .map(hotel => `
        <div style="background-color: #f8f9fa; padding: 20px; margin: 10px 0; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
              <p><strong>Day:</strong> ${hotel.day}</p>
              <p><strong>Property Name:</strong> ${hotel.propertyName}</p>
              <p><strong>City:</strong> ${hotel.cityName}</p>
              <p><strong>Room Type:</strong> ${hotel.roomName}</p>
              <p><strong>Meal Plan:</strong> ${hotel.mealPlan}</p>
            </div>
            <div>
              <p><strong>Cost:</strong> ₹${hotel.cost}</p>
              <p><strong>Extra Adult Rate:</strong> ₹${hotel.extraAdultRate}</p>
              <p><strong>Star Rating:</strong> ${hotel.basicInfo?.hotelStarRating || 'N/A'}</p>
            </div>
          </div>
          
        </div>
      `).join('');

    // Add inclusions if available
    const inclusionsHtml = hotelGroupData.inclusions && hotelGroupData.inclusions.length > 0 
      ? `
        <div style="background-color: #ffffff; padding: 25px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.1); margin-bottom: 20px;">
          <h2 style="color: #003366; border-bottom: 2px solid #003366; padding-bottom: 10px;">Inclusions</h2>
          <ul style="list-style-type: disc; padding-left: 20px;">
            ${hotelGroupData.inclusions.map(inclusion => `<li style="margin: 8px 0;">${inclusion}</li>`).join('')}
          </ul>
        </div>
      ` : '';

    // Send initial email to get messageId
    const initialMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Hotel Booking Request - ${hotelGroupData.propertyName} (${hotelGroupData.hotels.length} nights)`,
      text: 'Preparing your hotel booking request...'
    };

    const info = await transporter.sendMail(initialMailOptions);
    const messageId = info.messageId;

    // Create final HTML content with the correct messageId
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="background-color: #003366; color: white; padding: 20px; border-radius: 10px; margin-bottom: 30px;">
          <h1 style="margin: 0;">Hotel Booking Request</h1>
          <p style="margin: 10px 0 0;">Booking ID: ${hotelGroupData.bookingId}</p>
          <p style="margin: 5px 0 0;">Property: ${hotelGroupData.propertyName}</p>
          <p style="margin: 5px 0 0;">City: ${hotelGroupData.cityName}</p>
        </div>

        <div style="background-color: #ffffff; padding: 25px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.1); margin-bottom: 20px;">
          <h2 style="color: #003366; border-bottom: 2px solid #003366; padding-bottom: 10px;">Hotels Information</h2>
          ${hotelsHtml}
        </div>

        ${inclusionsHtml}

        <div style="background-color: #ffffff; padding: 25px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.1); margin-bottom: 20px;">
          <h2 style="color: #003366; border-bottom: 2px solid #003366; padding-bottom: 10px;">Stay Details</h2>
          <div style="margin-bottom: 20px;">
            <h3>Selected Dates</h3>
            <div style="display: flex; flex-wrap: wrap;">
              ${datesHtml}
            </div>
          </div>
          
          <div style="margin-bottom: 20px;">
            <h3>Guest Information</h3>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">
              <p><strong>Guest Name:</strong> ${hotelGroupData.contactInfo.name}</p>
              <p><strong>Adults:</strong> ${hotelGroupData.numberOfGuests.adults}</p>
              <p><strong>Children:</strong> ${hotelGroupData.numberOfGuests.kids}</p>
              <p><strong>Extra Beds:</strong> ${hotelGroupData.numberOfGuests.extraBeds}</p>
              <p><strong>Number of Rooms:</strong> ${hotelGroupData.numberOfRooms}</p>
            </div>
          </div>
          
          <div style="margin-bottom: 20px;">
            <h3>Total Amount</h3>
            <p style="font-size: 24px; font-weight: bold; color: #28a745;"><strong>Total Amount:</strong> ₹${hotelGroupData.totalAmount}</p>
          </div>
        </div>

        <div style="text-align: center; margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 10px;">
          <p style="font-size: 18px; margin-bottom: 20px;">Please confirm your response to this booking request:</p>
          <a href="https://operation.plutotours.com/api/finalcosting/group-email-response/${operationId}/accept/${messageId}" 
              style="display: inline-block; background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; margin: 0 10px; border-radius: 5px; font-weight: bold;">
             Accept Booking
          </a>
          <a href="https://operation.plutotours.com/api/finalcosting/group-email-response/${operationId}/reject/${messageId}"
             style="display: inline-block; background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; margin: 0 10px; border-radius: 5px; font-weight: bold;">
             Reject Booking
          </a>
        </div>
      </div>
    `;

    // Update the email with the complete content
    const finalMailOptions = {
      ...initialMailOptions,
      html: htmlContent,
      text: undefined // Remove the text content
    };

    await transporter.sendMail(finalMailOptions);

    // Update the email status for all hotels in the group with the same messageId
    const updateQueries = hotelIndices.map(hotelIndex => ({
      [`hotels.${hotelIndex}.emailStatus`]: {
        messageId: messageId,
        status: 'sent',
        sentAt: new Date(),
        groupEmail: true, // Flag to indicate this is part of a group email
        groupProperty: hotelGroupData.propertyName,
        groupCity: hotelGroupData.cityName
      }
    }));

    // Apply all updates in a single operation
    const combinedUpdate = updateQueries.reduce((acc, query) => ({ ...acc, ...query }), {});
    
    await Operation.findByIdAndUpdate(operationId, {
      $set: combinedUpdate
    });
    
    res.status(200).json({ 
      message: 'Group email sent successfully', 
      messageId: messageId,
      hotelsUpdated: hotelIndices.length
    });
  } catch (error) {
    console.error('Group email sending error:', error);
    next(error);
  }
};

// New function to handle group email responses
export const handleGroupEmailResponse = async (req, res, next) => {
  try {
    const { operationId, response } = req.params;
    let { messageId, reason } = req.params;
    
    // Add angle brackets and @gmail.com if they're not present
    if (!messageId.includes('@')) {
      messageId = `${messageId}@gmail.com`;
    }
    if (!messageId.startsWith('<')) {
      messageId = `<${messageId}`;
    }
    if (!messageId.endsWith('>')) {
      messageId = `${messageId}>`;
    }

    if (!['accept', 'reject'].includes(response)) {
      return res.status(400).json({ message: 'Invalid response type' });
    }

    const operation = await Operation.findById(operationId);
    if (!operation) {
      return res.status(404).json({ message: 'Operation not found' });
    }

    // Find all hotels with the matching messageId (group email)
    const hotelIndices = [];
    operation.hotels.forEach((hotel, index) => {
      if (hotel.emailStatus && hotel.emailStatus.messageId === messageId) {
        hotelIndices.push(index);
      }
    });

    if (hotelIndices.length === 0) {
      return res.status(404).json({ message: 'No hotels found for this email' });
    }

    // Update email status for all hotels in the group
    const updateQueries = hotelIndices.reduce((acc, hotelIndex) => {
      acc[`hotels.${hotelIndex}.emailStatus.recipientResponse`] = response;
      acc[`hotels.${hotelIndex}.emailStatus.respondedAt`] = new Date();
      
      // Add rejection reason if provided and response is reject
      if (response === 'reject' && reason) {
        acc[`hotels.${hotelIndex}.emailStatus.rejectionReason`] = decodeURIComponent(reason);
      }
      
      return acc;
    }, {});

    await Operation.findByIdAndUpdate(operationId, {
      $set: updateQueries
    });

    // Get property name for response display
    const firstHotel = operation.hotels[hotelIndices[0]];
    const propertyName = firstHotel.propertyName;
    const hotelCount = hotelIndices.length;

    // Send a thank you page or redirect
    res.send(`
      <html>
        <head>
          <title>Booking Response Confirmed</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .header { background-color: #003366; color: white; padding: 20px; border-radius: 10px; margin-bottom: 30px; }
            .content { background-color: #f8f9fa; padding: 20px; border-radius: 10px; }
            .success { color: #28a745; font-size: 24px; font-weight: bold; }
            .details { margin: 20px 0; padding: 15px; background-color: white; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Thank you for your response!</h1>
          </div>
          <div class="content">
            <p class="success">✓ Response Recorded Successfully</p>
            <div class="details">
              <p><strong>You have ${response}ed the hotel booking request for:</strong></p>
              <p><strong>Property:</strong> ${propertyName}</p>
              <p><strong>Total nights:</strong> ${hotelCount}</p>
              <p><strong>Booking Status:</strong> ${response.charAt(0).toUpperCase() + response.slice(1)}ed</p>
              ${response === 'reject' && reason ? `<p><strong>Reason:</strong> ${decodeURIComponent(reason)}</p>` : ''}
            </div>
            <p>We will process your response and contact you shortly with further details.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    next(error);
  }
};
export const getConvertedOperationsWithoutTransfer = async (req, res, next) => {
  try {
    // Get page and limit from query parameters, set defaults if not provided
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const skip = (page - 1) * limit;

    const query = { converted: true };

    const [operations, total] = await Promise.all([
      Operation.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select({ transfer: 0 })
        .lean(),
      Operation.countDocuments(query)
    ]);

    res.status(200).json({
      operations,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getConvertedOperationsWithoutHotels = async (req, res, next) => {
  try {
    // Get page and limit from query parameters, set defaults if not provided
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const query = { converted: true };
    const projection = {
      hotels: 0,
      'transfer.itineraryDays.selectedHotel': 0
    };

    const [operations, total] = await Promise.all([
      Operation.find(query, projection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean({ getters: true }),
      Operation.countDocuments(query)
    ]);

    res.status(200).json({
      operations,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    next(error);
  }
};
export const handleEmailResponse = async (req, res, next) => {
  try {
    const { operationId, response } = req.params;
    let { messageId, reason } = req.params;
    
    // Add angle brackets and @gmail.com if they're not present
    if (!messageId.includes('@')) {
      messageId = `${messageId}@gmail.com`;
    }
    if (!messageId.startsWith('<')) {
      messageId = `<${messageId}`;
    }
    if (!messageId.endsWith('>')) {
      messageId = `${messageId}>`;
    }

    if (!['accept', 'reject'].includes(response)) {
      return res.status(400).json({ message: 'Invalid response type' });
    }

    const operation = await Operation.findById(operationId);
    if (!operation) {
      return res.status(404).json({ message: 'Operation not found' });
    }

    // Find the hotel with the matching messageId
    const hotelIndex = operation.hotels.findIndex(h => 
      h.emailStatus && h.emailStatus.messageId === messageId
    );

    if (hotelIndex === -1) {
      return res.status(404).json({ message: 'Hotel not found' });
    }

    // Update email status for the specific hotel
    const updateQuery = {};
    updateQuery[`hotels.${hotelIndex}.emailStatus.recipientResponse`] = response;
    updateQuery[`hotels.${hotelIndex}.emailStatus.respondedAt`] = new Date();
    
    // Add rejection reason if provided and response is reject
    if (response === 'reject' && reason) {
      updateQuery[`hotels.${hotelIndex}.emailStatus.rejectionReason`] = decodeURIComponent(reason);
    }

    await Operation.findByIdAndUpdate(operationId, {
      $set: updateQuery
    });

    // Send a thank you page or redirect
    res.send(`
      <html>
        <body>
          <h1>Thank you for your response</h1>
          <p>You have ${response}ed the hotel booking request.</p>
          ${response === 'reject' && reason ? `<p><strong>Reason:</strong> ${decodeURIComponent(reason)}</p>` : ''}
        </body>
      </html>
    `);
  } catch (error) {
    next(error);
  }
};
export const getConvertedOperations = async (req, res, next) => {
  try {
    // Get page and limit from query parameters, set defaults if not provided
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    // Get total count of converted documents
    const total = await Operation.countDocuments({ converted: true });

    // Try aggregation with allowDiskUse, fallback to find if it fails
    let operations;
    try {
      const cursor = Operation.collection.aggregate([
        { $match: { converted: true } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      ], { allowDiskUse: true });
      
      operations = await cursor.toArray();
    } catch (error) {
      // Fallback to find without sorting if aggregation fails
      console.warn('Aggregation failed, falling back to find without sorting:', error.message);
      operations = await Operation.find({ converted: true })
        .skip(skip)
        .limit(limit)
        .lean(); // Use lean() for better performance
    }

    // Transform operations to exclude selectedHotel from itineraryDays
    const transformedOperations = operations.map(operation => {
      if (operation.transfer && Array.isArray(operation.transfer.itineraryDays)) {
        operation.transfer.itineraryDays = operation.transfer.itineraryDays.map(day => {
          const { selectedHotel, ...dayWithoutHotel } = day;
          return dayWithoutHotel;
        });
      }
      return operation;
    });

    res.status(200).json({
      operations: transformedOperations,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getOperationByMongoId = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid operation ID format' });
    }
    
    // Find operation by MongoDB _id
    const operation = await Operation.findById(id)
      .lean() // Faster - returns plain objects
      .maxTimeMS(70000); // Set timeout to prevent hanging queries
    
    if (!operation) {
      return res.status(404).json({ message: 'Operation not found' });
    }
    
    res.status(200).json(operation);
  } catch (error) {
    next(error);
  }
};

export const getConvertedOperationById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find the specific converted operation by ID
    const operation = await Operation.findOne({ _id: id, converted: true })
      .select({
        id: 1,
        customerLeadId: 1,
        userId: 1,
        converted: 1,
        conversionType: 1,
        hotels: 1,
        'transfer.details': 1,
        'transfer.selectedLead._id': 1,
         editdetail: 1,
        activities: 1,
        createdAt: 1,
        updatedAt: 1
      });

    if (!operation) {
      return res.status(404).json({ message: 'Converted operation not found' });
    }

    // Transform the data to include only required fields and fetch lead data
    const transformedOperation = operation.toObject();
    
    // Transform hotels to include only day, cityName, and propertyName
    if (transformedOperation.hotels && Array.isArray(transformedOperation.hotels)) {
      transformedOperation.hotels = transformedOperation.hotels.map(hotel => ({
        day: hotel.day,
        cityName: hotel.cityName,
        propertyName: hotel.propertyName,
        verified: hotel?.verified || false
      }));
    }

    // Transform transfer.details to include only cabName, cabType, and day
    if (transformedOperation.transfer && transformedOperation.transfer.details && Array.isArray(transformedOperation.transfer.details)) {
      transformedOperation.transfer.details = transformedOperation.transfer.details.map(detail => ({
        cabName: detail.cabName,
        cabType: detail.cabType,
        day: detail.day,
        id: detail._id,
        verified: detail?.verified || false
      }));
    }

    // Fetch lead data if transfer.selectedLead exists
    if (transformedOperation.transfer && transformedOperation.transfer.selectedLead && transformedOperation.transfer.selectedLead._id) {
      try {
        const leadData = await Lead.findById(transformedOperation.transfer.selectedLead._id);
        transformedOperation.leadata = leadData;
      } catch (error) {
        console.error('Error fetching lead data:', error);
        transformedOperation.leadata = null;
      }
    } else {
      transformedOperation.leadata = null;
    }

    res.status(200).json({
      operation: transformedOperation
    });
  } catch (error) {
    next(error);
  }
};

export const getConvertedOperationsWithDetails = async (req, res, next) => {
  try {
    // Get page and limit from query parameters, set defaults if not provided
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    // Get total count of converted documents
    const total = await Operation.countDocuments({ converted: true });

    // Try aggregation with allowDiskUse, fallback to find if it fails
    let operations;
    try {
      const cursor = Operation.collection.aggregate([
        { $match: { converted: true } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: {
          id: 1,
          operationAssignReportId: 1,
          customerLeadId: 1,
          userId: 1,
          converted: 1,
          conversionType: 1,
          hotels: 1,
          totals: 1,
          finalTotal: 1,
          marginPercentage: 1,
          discountPercentage: 1,
          'transfer.details': 1,
          'transfer.selectedLead._id': 1,
          editdetail: 1,
          activities: 1,
          createdAt: 1,
          updatedAt: 1
        }}
      ], { allowDiskUse: true });
      
      operations = await cursor.toArray();
    } catch (error) {
      // Fallback to find without sorting if aggregation fails
      console.warn('Aggregation failed, falling back to find without sorting:', error.message);
      operations = await Operation.find({ converted: true })
        .select({
          id: 1,
          customerLeadId: 1,
          userId: 1,
          converted: 1,
          conversionType: 1,
          hotels: 1,
          totals: 1,
          finalTotal: 1,
          marginPercentage: 1,
          discountPercentage: 1,
          'transfer.details': 1,
          'transfer.selectedLead._id': 1,
          editdetail: 1,
          activities: 1,
          createdAt: 1,
          updatedAt: 1
        })
        .skip(skip)
        .limit(limit)
        .lean(); // Use lean() for better performance
    }

    // Transform the data to include only required fields and fetch lead data
    const transformedOperations = await Promise.all(operations.map(async (operation) => {
      const transformedOperation = operation; // Already a plain object from aggregation
      // Transform hotels to include only day, cityName, and propertyName
      if (transformedOperation.hotels && Array.isArray(transformedOperation.hotels)) {
        transformedOperation.hotels = transformedOperation.hotels.map(hotel => ({
          day: hotel.day,
          cityName: hotel.cityName,
          propertyName: hotel.propertyName,
          verified: hotel?.verified || false
        }));
      }

      // Transform transfer.details to include only cabName, cabType, and day
      if (transformedOperation.transfer && transformedOperation.transfer.details && Array.isArray(transformedOperation.transfer.details)) {
        transformedOperation.transfer.details = transformedOperation.transfer.details.map(detail => ({
          cabName: detail.cabName,
          cabType: detail.cabType,
          day: detail.day,
          id: detail._id,
          verified: detail?.verified || false
        }));
      }

      // Fetch lead data if transfer.selectedLead exists
      if (transformedOperation.transfer && transformedOperation.transfer.selectedLead && transformedOperation.transfer.selectedLead._id) {
        try {
          const leadData = await Lead.findById(transformedOperation.transfer.selectedLead._id);
          transformedOperation.leadata = leadData;
        } catch (error) {
          console.error('Error fetching lead data:', error);
          transformedOperation.leadata = null;
        }
      } else {
        transformedOperation.leadata = null;
      }

      // Fetch cab booking data if operation id matches bookingId
      try {
        const cabBookingData = await CabBooking.findOne({ bookingId: transformedOperation._id });
        if (cabBookingData) {
          transformedOperation.cabBookingData = {
            responseDetails: cabBookingData.responseDetails,
            cost: cabBookingData.cost,
            editprice: cabBookingData.tripDetails?.editprice || null
          };
        } else {
          transformedOperation.cabBookingData = null;
        }
      } catch (error) {
        console.error('Error fetching cab booking data:', error);
        transformedOperation.cabBookingData = null;
      }

      // Keep transfer.selectedLead and activities as they are
      // (they're already included in the select statement)

      return transformedOperation;
    }));

    res.status(200).json({
      operations: transformedOperations,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    next(error);
  }
};

// Handle DSN webhooks
export const handleEmailWebhook = async (req, res, next) => {
  try {
    const { messageId, status, event } = req.body;

    // Find operation and hotel with matching messageId
    const operation = await Operation.findOne({
      'hotels.emailStatus.messageId': messageId
    });

    if (!operation) {
      return res.status(404).json({ message: 'Operation not found' });
    }

    // Find the specific hotel
    const hotelIndex = operation.hotels.findIndex(h => 
      h.emailStatus && h.emailStatus.messageId === messageId
    );

    // Update email status for the specific hotel
    const updateQuery = {};
    updateQuery[`hotels.${hotelIndex}.emailStatus.status`] = status;
    updateQuery[`hotels.${hotelIndex}.emailStatus.lastEvent`] = event;
    updateQuery[`hotels.${hotelIndex}.emailStatus.updatedAt`] = new Date();

    await Operation.findByIdAndUpdate(operation._id, {
      $set: updateQuery
    });

    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    next(error);
  }
};
export const updateOperationFields = async (req, res, next) => {
  try {
    const updatedOperation = await Operation.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    
    if (!updatedOperation) {
      return res.status(404).json({ message: 'Operation not found' });
    }
    
    res.status(200).json(updatedOperation);
  } catch (error) {
    next(error);
  }
};

export const getConvertedOperationByIdAllData = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find the specific converted operation by ID with all data (no field restrictions)
    const operation = await Operation.findOne({ _id: id, converted: true });

    if (!operation) {
      return res.status(404).json({ message: 'Converted operation not found' });
    }

    res.status(200).json({
      operation: operation
    });
  } catch (error) {
    next(error);
  }
};
export const updateNotedata = async (req, res, next) => {
  try {
    const { operationId } = req.params;
    const { notedata } = req.body;

    // Validate that notedata is provided
    if (!notedata) {
      return res.status(400).json({ message: 'notedata field is required' });
    }

    // Validate the structure of notedata
    if (!Array.isArray(notedata)) {
      return res.status(400).json({ message: 'notedata must be an array' });
    }

    // Validate each note entry
    for (const note of notedata) {
      if (!note.type || !note.note || !note.rejectedbycustomer || !note.timestamp || !note.bookingId) {
        return res.status(400).json({ 
          message: 'Each note must contain: type, note, rejectedbycustomer, timestamp, and bookingId' 
        });
      }
    }

    // Update only the notedata field
    const updatedOperation = await Operation.findByIdAndUpdate(
      operationId,
      { $set: { notedata: notedata } },
      { new: true }
    );
    
    if (!updatedOperation) {
      return res.status(404).json({ message: 'Operation not found' });
    }
    
    res.status(200).json({
      message: 'Notedata updated successfully',
      operation: updatedOperation
    });
  } catch (error) {
    next(error);
  }
};
export const updateEditdetail = async (req, res, next) => {
  try {
    const { operationId } = req.params;
    const { editdetail } = req.body;

    // Validate that editdetail is provided
    if (!editdetail) {
      return res.status(400).json({ message: 'editdetail field is required' });
    }

    // Update only the editdetail field
    const updatedOperation = await Operation.findByIdAndUpdate(
      operationId,
      { $set: { editdetail: editdetail } },
      { new: true }
    );
    
    if (!updatedOperation) {
      return res.status(404).json({ message: 'Operation not found' });
    }
    
    res.status(200).json({
      message: 'Editdetail updated successfully',
      operation: updatedOperation
    });
  } catch (error) {
    next(error);
  }
};

export const deleteEditdetail = async (req, res, next) => {
  try {
    const { operationId } = req.params;

    // Update the operation to remove editdetail field
    const updatedOperation = await Operation.findByIdAndUpdate(
      operationId,
      { $unset: { editdetail: 1 } },
      { new: true }
    );
    
    if (!updatedOperation) {
      return res.status(404).json({ message: 'Operation not found' });
    }
    
    res.status(200).json({
      message: 'Editdetail deleted successfully',
      operation: updatedOperation
    });
  } catch (error) {
    next(error);
  }
};

export const deleteOldNonConvertedOperations = async (req, res, next) => {
  try {
    // Calculate the date 10 days ago
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10); // 10 days

    // Find and delete operations that:
    // 1. Are NOT converted (converted !== true, which includes false, null, or undefined)
    // 2. Were created more than 10 days ago
    const deleteResult = await Operation.deleteMany({
      $or: [
        { converted: { $ne: true } }, // Not equal to true (includes false, null, undefined)
        { converted: { $exists: false } } // Field doesn't exist
      ],
      createdAt: { $lt: tenDaysAgo } // Created before 10 days ago
    });

    res.status(200).json({
      message: 'Old non-converted operations deleted successfully',
      deletedCount: deleteResult.deletedCount,
      cutoffDate: tenDaysAgo.toISOString(),
      note: 'All operations with converted: true are preserved regardless of age'
    });
  } catch (error) {
    next(error);
  }
};

export const updateOperationAssignReportId = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { operationAssignReportId } = req.body;

    // Validate that operationAssignReportId is provided
    if (operationAssignReportId === undefined || operationAssignReportId === null) {
      return res.status(400).json({ message: 'operationAssignReportId field is required' });
    }

    // Validate MongoDB ObjectId format for the operation id
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid operation ID format' });
    }

    // Update only the operationAssignReportId field
    const updatedOperation = await Operation.findByIdAndUpdate(
      id,
      { $set: { operationAssignReportId: operationAssignReportId } },
      { 
        new: true,
        runValidators: false,
        maxTimeMS: 70000
      }
    );
    
    if (!updatedOperation) {
      return res.status(404).json({ message: 'Operation not found' });
    }
    
    res.status(200).json({
      message: 'OperationAssignReportId updated successfully',
      operation: updatedOperation
    });
  } catch (error) {
    next(error);
  }
};

export const getOperationByAssignReportId = async (req, res, next) => {
  try {
    const { operationAssignReportId } = req.params;

    // Validate operationAssignReportId is provided
    if (!operationAssignReportId) {
      return res.status(400).json({ message: 'operationAssignReportId is required' });
    }

    // Get page and limit from query parameters, set defaults if not provided
    const page = Math.max(1, parseInt(req.query.page, 10) || 1); // Ensure page is at least 1
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30)); // Limit between 1-100, default 30
    const skip = (page - 1) * limit;

    // Find operations by operationAssignReportId
    const query = { operationAssignReportId: operationAssignReportId };

    // Get total count of documents
    const total = await Operation.countDocuments(query).maxTimeMS(70000);

    // Try aggregation with allowDiskUse, fallback to find if it fails
    let operations;
    try {
      const cursor = Operation.collection.aggregate([
        { $match: query },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: {
          id: 1,
          customerLeadId: 1,
          userId: 1,
          converted: 1,
          conversionType: 1,
          hotels: 1,
          totals: 1,
          finalTotal: 1,
          marginPercentage: 1,
          discountPercentage: 1,
          'transfer.details': 1,
          'transfer.selectedLead._id': 1,
          editdetail: 1,
          activities: 1,
          createdAt: 1,
          updatedAt: 1
        }}
      ], { allowDiskUse: true });
      
      operations = await cursor.toArray();
    } catch (error) {
      // Fallback to find without sorting if aggregation fails
      console.warn('Aggregation failed, falling back to find without sorting:', error.message);
      operations = await Operation.find(query)
        .select({
          id: 1,
          customerLeadId: 1,
          userId: 1,
          converted: 1,
          conversionType: 1,
          hotels: 1,
          totals: 1,
          finalTotal: 1,
          marginPercentage: 1,
          discountPercentage: 1,
          'transfer.details': 1,
          'transfer.selectedLead._id': 1,
          editdetail: 1,
          activities: 1,
          createdAt: 1,
          updatedAt: 1
        })
        .skip(skip)
        .limit(limit)
        .lean(); // Use lean() for better performance
    }

    // Transform the data to include only required fields and fetch lead data
    const transformedOperations = await Promise.all(operations.map(async (operation) => {
      const transformedOperation = operation; // Already a plain object from aggregation
      // Transform hotels to include only day, cityName, and propertyName
      if (transformedOperation.hotels && Array.isArray(transformedOperation.hotels)) {
        transformedOperation.hotels = transformedOperation.hotels.map(hotel => ({
          day: hotel.day,
          cityName: hotel.cityName,
          propertyName: hotel.propertyName,
          verified: hotel?.verified || false
        }));
      }

      // Transform transfer.details to include only cabName, cabType, and day
      if (transformedOperation.transfer && transformedOperation.transfer.details && Array.isArray(transformedOperation.transfer.details)) {
        transformedOperation.transfer.details = transformedOperation.transfer.details.map(detail => ({
          cabName: detail.cabName,
          cabType: detail.cabType,
          day: detail.day,
          id: detail._id,
          verified: detail?.verified || false
        }));
      }

      // Fetch lead data if transfer.selectedLead exists
      if (transformedOperation.transfer && transformedOperation.transfer.selectedLead && transformedOperation.transfer.selectedLead._id) {
        try {
          const leadData = await Lead.findById(transformedOperation.transfer.selectedLead._id);
          transformedOperation.leadata = leadData;
        } catch (error) {
          console.error('Error fetching lead data:', error);
          transformedOperation.leadata = null;
        }
      } else {
        transformedOperation.leadata = null;
      }

      // Fetch cab booking data if operation id matches bookingId
      try {
        const cabBookingData = await CabBooking.findOne({ bookingId: transformedOperation._id });
        if (cabBookingData) {
          transformedOperation.cabBookingData = {
            responseDetails: cabBookingData.responseDetails,
            cost: cabBookingData.cost,
            editprice: cabBookingData.tripDetails?.editprice || null
          };
        } else {
          transformedOperation.cabBookingData = null;
        }
      } catch (error) {
        console.error('Error fetching cab booking data:', error);
        transformedOperation.cabBookingData = null;
      }

      // Keep transfer.selectedLead and activities as they are
      // (they're already included in the select statement)

      return transformedOperation;
    }));

    res.status(200).json({
      operations: transformedOperations,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    next(error);
  }
};
