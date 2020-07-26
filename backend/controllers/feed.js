const fs = require('fs');
const path = require('path');

const { validationResult } = require('express-validator/check');

const io = require('../socket');
const Post = require('../models/post');
const User = require('../models/user');

exports.getPosts = async (req, res, next) => {
  try {
    const currentPage = req.query.page || 1;
    const perPage = 2;
    const totalItems = await Post.find().countDocuments(perPage);
    const posts = await Post.find().populate('creator').sort({ createdAt: -1 }).skip((currentPage - 1) * perPage).limit(perPage);
    res.status(200).json({
      message: 'Posts Fetching Successfull',
      posts: posts,
      totalItems: totalItems
    });
  } catch (err) {
    if(!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.createPost = (req, res, next) => {
  const errors = validationResult(req);
  if(!errors.isEmpty()) {
    const error = new Error('Validation Failed, entered data is incorrect.');
    error.statusCode = 422;
    throw error;
  }
  if(!req.file) {
    const error = new Error('Image Required.');
    error.statusCode = 422;
    throw error;
  }
  const imageUrl = req.file.path.replace("\\" ,"/");
  const title = req.body.title;
  const content = req.body.content;
  let creator;
  const post = new Post({
    title: title,
    content: content,
    imageUrl: imageUrl,
    creator: req.userId
  })
  post.save()
  .then(result => {
    return User.findById(req.userId);
  })
  .then(user => {
    creator = user;
    user.posts.push(post);
    return user.save();
  })
  .then(result => {
    io.getIO().emit('posts', { action: 'create', post: {...post._doc, creator: {_id: req.userId, name: creator.name}} });
    res.status(201).json({
      message: 'Post Created Successfully',
      post: post,
      creator: { _id: creator._id, name: creator.name }
    })
  })
  .catch(err => {
    if(!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  })
};

exports.getPost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
  .populate('creator')
  .then(post => {
    if(!post) {
      const err = new Error('Post Not Found.');
      error.statusCode = 404;
      throw error;
    }
    res.status(200).json({message: 'Post Fetched', post: post});
  })
  .catch(err => {
    if(!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  });
};

exports.updatePost = (req, res, next) => {
  const postId = req.params.postId;
  const errors = validationResult(req);
  if(!errors.isEmpty()) {
    const error = new Error('Validation Failed, entered data is incorrect.');
    error.statusCode = 422;
    throw error;
  }
  const title = req.body.title;
  const content = req.body.content;
  let imageUrl = req.body.image;
  if(req.file) {
    const imageUrl = req.file.path.replace("\\" ,"/");
  }
  if(!imageUrl) {
    const error = new Error('Image Required.');
    error.statusCode = 422;
    throw error;
  }
  Post.findById(postId).populate('creator')
  .then(post => {
    if(!post) {
      const err = new Error('Post Not Found.');
      error.statusCode = 404;
      throw error;
    }
    if(!(post.creator._id.toString() === req.userId)) {
      const error = new Error('Not Authorized');
      error.statusCode = 401;
      throw error;
    }
    if (imageUrl !== post.imageUrl) {
      clearImage(post.imageUrl);
    }
    post.title = title;
    post.imageUrl = imageUrl;
    post.content  = content;
    return post.save();
  })
  .then(result => {
    io.getIO().emit('posts', { action: 'update', post: result });
    res.status(200).json({message: 'Post Updated', post: result});
  })
  .catch(err => {
    if(!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  })
};

exports.deletePost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
  .then(post => {
    if(!post) {
      const err = new Error('Post Not Found.');
      error.statusCode = 404;
      throw error;
    }
    if(!(post.creator.toString() === req.userId)) {
      const error = new Error('Not Authorized');
      error.statusCode = 401;
      throw error;
    }
    clearImage(post.imageUrl);
    return Post.findByIdAndRemove(postId);
  })
  .then(result => {
    return User.findById(req.userId)
  })
  .then(user => {
    user.posts.pull(postId);
    return user.save();
  })
  .then(result => {
    io.getIO().emit('posts', { action: 'delete', post: postId });
    res.status(200).json({message: 'Post deleted.'});
  })
  .catch(err => {
    if(!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  })
}

const clearImage = filePath => {
  filePath = path.join(__dirname, '..', filePath);
  fs.unlink(filePath, err => console.log(err));
};

exports.getStatus = async (req, res, next) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);
    if(!user) {
      const error = new Error('User Not Found!');
      error.statusCode = 401;
      throw error;
    }
    res.status(200).json({ message: 'Status Fetched', status: user.status });
  } catch (err) {
    if(!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};
