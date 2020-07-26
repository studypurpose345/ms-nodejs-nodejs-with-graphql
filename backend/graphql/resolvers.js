const bcrypt = require('bcrypt');
const validator = require('validator');
const jwt = require('jsonwebtoken');

const User = require('../models/user');
const Post = require('../models/post');
const { clearImage } = require('../util/file');

module.exports = {
  createUser: async function({ userInput }, req) {
    const email = userInput.email;
    const password = userInput.password;
    const name = userInput.name;
    const errors = [];
    if(!validator.isEmail(email)) {
      errors.push({message: 'Invalid Email.'});
    }
    if(validator.isEmpty(password) || !validator.isLength(password, { min: 5 })) {
      errors.push({message: 'Invalid Password'});
    }
    if (errors.length > 0) {
      const error = new Error('Invalid Input.');
      error.data = errors;
      error.code = 422;
      throw error;
    }
    const existingUser = await User.findOne({ email: email });
    if (existingUser) {
      const error = new Error('Email Already Exists');
      throw error;
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({
      email: email,
      name: name,
      password: hashedPassword
    })
    const createUser = await user.save();
    return {
      ...createUser._doc, _id: createUser._id.toString()
    };
  },
  login: async function({ email, password }) {
    const user = await User.findOne({email: email});
    if(!user) {
      const error = new Error('User Not Found');
      error.code = 401;
      throw error;
    }
    const isEqual = await bcrypt.compare(password, user.password);
    if(!isEqual) {
      const error = new Error('Incorrect Password');
      error.code = 401;
      throw error;
    }
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email
      }, 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImp0aSI6IjMwNzc0Njc1LTZkYTQtNDJiMC1iZjliLTZhY2M0NjUwZDEyMiIsImlhdCI6MTU4NTY3MDk3MiwiZXhwIjoxNTg1Njc0NTcyfQ.7ZZCiNmEWQ53kgB0aOa7lwBTeFnzE6j01PsKWlux2Ws',
      { expiresIn: '1h' }
    );
    return { token: token, userId: user._id.toString() };
  },
  createPost: async function({ postInput}, req) {
    if(!req.isAuth) {
      const error = new Error('Not Authenticated.')
      error.code = 401;
      throw error;
    }
    const errors = [];
    if(validator.isEmpty(postInput.title) || !validator.isLength(postInput.title, { min: 5 })) {
      errors.push({ message: 'Invalid Title' });
    }
    if(validator.isEmpty(postInput.content) || !validator.isLength(postInput.content, { min: 5 })) {
      errors.push({ message: 'Invalid Content' });
    }
    if (errors.length > 0) {
      const error = new Error('Invalid Input.');
      error.data = errors;
      error.code = 422;
      throw error;
    }
    const user = await User.findById(req.userId);
    if(!user) {
      const error = new Error('Invalid User.');
      error.code = 401;
      throw error;
    }
    const post = new Post({
      title: postInput.title,
      content: postInput.content,
      imageUrl: postInput.imageUrl,
      creator: user
    });
    const createdPost = await post.save();
    user.posts.push(createdPost);
    await user.save();
    return {
      ...createdPost._doc,
      _id: createdPost._id.toString(),
      createdAt: createdPost.createdAt.toISOString(),
      updatedAt: createdPost.updatedAt.toISOString()
    };
  },
  posts: async function({ page }, req) {
    if(!req.isAuth) {
      const error = new Error('Not Authenticated.')
      error.code = 401;
      throw error;
    }
    if(!page) {
      page = 1;
    }
    const perPage = 2;
    const totalPosts = await Post.find().countDocuments();
    const posts = await Post.find()
    .skip((page - 1) * perPage)
    .limit(perPage)
    .sort({ createdAt: -1 })
    .populate('creator');
    return { posts: posts.map(post => {
      return {
        ...post._doc,
        _id: post._id.toString(),
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString()
      }
    }), totalPosts: totalPosts };
  },
  post: async function({ id }, req) {
    if(!req.isAuth) {
      const error = new Error('Not Authenticated.')
      error.code = 401;
      throw error;
    }
    const post = await Post.findById(id).populate('creator');
    if(!post) {
      const error = new Error('Post Not Found.')
      error.code = 404;
      throw error;
    }
    return {
      ...post._doc,
      _id: post._id.toString(),
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString()
    }
  },
  updatePost: async function({ id, postInput }, req) {
    if(!req.isAuth) {
      const error = new Error('Not Authenticated.')
      error.code = 401;
      throw error;
    }
    const post = await Post.findById(id).populate('creator');
    if(!post) {
      const error = new Error('Post Not Found.')
      error.code = 404;
      throw error;
    }
    if(post.creator._id.toString() !== req.userId.toString()) {
      const error = new Error('Not Authorized');
      error.code = 403;
      throw error;
    }
    const errors = [];
    if(validator.isEmpty(postInput.title) || !validator.isLength(postInput.title, { min: 5 })) {
      errors.push({ message: 'Invalid Title' });
    }
    if(validator.isEmpty(postInput.content) || !validator.isLength(postInput.content, { min: 5 })) {
      errors.push({ message: 'Invalid Content' });
    }
    if (errors.length > 0) {
      const error = new Error('Invalid Input.');
      error.data = errors;
      error.code = 422;
      throw error;
    }
    post.title = postInput.title;
    post.content = postInput.content;
    if(postInput.imageUrl !== 'undefined') {
      post.imageUrl = postInput.imageUrl
    }
    const updatedPost = await post.save();
    return {
      ...updatedPost._doc,
      _id: updatedPost._id.toString(),
      createdAt: updatedPost.createdAt.toISOString(),
      updatedAt: updatedPost.updatedAt.toISOString()
    }
  },
  deletePost: async function({ id }, req) {
    if(!req.isAuth) {
      const error = new Error('Not Authenticated.')
      error.code = 401;
      throw error;
    }
    const post = await Post.findById(id).populate('creator');
    if(!post) {
      const error = new Error('Post Not Found.')
      error.code = 404;
      throw error;
    }
    if(post.creator._id.toString() !== req.userId.toString()) {
      const error = new Error('Not Authorized');
      error.code = 403;
      throw error;
    }
    clearImage(post.imageUrl);
    await Post.findByIdAndRemove(id);
    const user = await User.findById(req.userId);
    user.posts.pull(id);
    await user.save();
    return true;
  },
  user: async  function(args, req) {
    if(!req.isAuth) {
      const error = new Error('Not Authenticated.')
      error.code = 401;
      throw error;
    }
    const user = await User.findById(req.userId);
    if(!user) {
      const error = new Error('User Not Found');
      error.code = 401;
      throw error;
    }
    return { ...user._doc, _id: user._id.toString() }
  },
  updateStatus: async function({ status }, req) {
    if(!req.isAuth) {
      const error = new Error('Not Authenticated.')
      error.code = 401;
      throw error;
    }
    const user = await User.findById(req.userId);
    if(!user) {
      const error = new Error('User Not Found');
      error.code = 401;
      throw error;
    }
    user.status = status;
    await user.save();
    return { ...user._doc, _id: user._id.toString() }
  }
};