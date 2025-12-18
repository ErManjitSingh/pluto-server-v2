import State from "../models/states.model.js";

export const createStates = async (req, res) => {
  const { countryName } = req.params;
  const { stateName } = req.body;

  try {
    const newState = new State({ stateName, country: countryName });
    console.log(newState);
    await newState.save();

    res.status(201).json(newState);
  } catch (error) {
    console.error("Error adding state:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export const getStates = async (req, res, next) => {
  const { countryName } = req.params;

  try {
    const states = await State.find({ country: countryName });

    res.json(states);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export const editState = async (req, res) => {
  const { stateId } = req.params;
  const { stateName } = req.body;

  try {
    const updatedState = await State.findByIdAndUpdate(
      stateId,
      { stateName },
      { new: true }
    );

    res.json(updatedState);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const deleteState = async (req, res) => {
  const { stateId } = req.params;

  try {
    await State.findByIdAndRemove(stateId);

    res.json({ message: "State deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};