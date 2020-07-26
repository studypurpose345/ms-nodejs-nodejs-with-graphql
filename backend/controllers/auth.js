const { validationResult } = require('express-validator/check');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const User = require('../models/user');

exports.signup = (req, res, next) => {
  const errors = validationResult(req);

  if(!errors.isEmpty()) {
    const error = new Error('Validation Failed, entered data is incorrect.');
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }
  const email = req.body.email;
  const password = req.body.password;
  const name = req.body.name;
  bcrypt.hash(password, 12)
  .then(hashedPassword => {
    const user = new User({
      email: email,
      password: hashedPassword,
      name: name
    })
    return user.save();
  })
  .then(result => {
    res.status(201).json({ message: 'User Created', userId: result._id });
  })
  .catch(err => {
    if(!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  })
};

exports.login = (req, res, next) => {
  const email = req.body.email;
  const password = req.body.password;
  let loadedUser;
  User.findOne({ email: email })
  .then(user => {
    if(!user) {
      const error = new Error('User Not Found!');
      error.statusCode = 401;
      throw error;
    }
    loadedUser = user;
    return bcrypt.compare(password, loadedUser.password);
  })
  .then(isEqual => {
    if(!isEqual) {
      const error = new Error('Password Mismatched!');
      error.statusCode = 401;
      throw error;
    }
    const token = jwt.sign(
      { email: loadedUser.email, userId: loadedUser._id.toString() },
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImp0aSI6IjMwNzc0Njc1LTZkYTQtNDJiMC1iZjliLTZhY2M0NjUwZDEyMiIsImlhdCI6MTU4NTY3MDk3MiwiZXhwIjoxNTg1Njc0NTcyfQ.7ZZCiNmEWQ53kgB0aOa7lwBTeFnzE6j01PsKWlux2Ws',
      { expiresIn: '1h' }
    );
    res.status(200).json({ token: token, userId: loadedUser._id.toString() });
  })
  .catch(err => {
    if(!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  })
};
