const express = require('express');

const { check, validationResult } = require('express-validator');

const gravatar = require('gravatar')

const bcrypt = require('bcryptjs')

const jwt = require('jsonwebtoken');

const app = express();

const mongoose = require('mongoose');

const config = require('config');

const request = require('request');

const dbLink = config.get('mongoURI');

const checkAuth = require('./middleware/auth');

const connectDb = async () => { try { await mongoose.connect(dbLink, { useNewUrlParser: true , useCreateIndex: true , useFindAndModify: false , useUnifiedTopology: true  }); console.log('\nDatabase Successfully Connected !!!\n') } catch (error) { console.log(error.message); process.exit(1); } }

connectDb();

const User = require('./models/User');

const Profile = require('./models/Profile');

const Post = require('./models/Post');

app.use(express.json({ extended: false }));

// routes with /api/auth

app.get('/api/auth', checkAuth, async (req, res) => {

    try {

        const user = await User.findById(req.user.id).select('-password');
        res.json(user);

    } catch (error) {
        
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })

    }

});


app.post('/api/auth', [
    
    check('email', 'Please enter a valid email...').isEmail(),
    check('password', 'Password is required...').exists()
    
    ] , async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        })
    }

    const { email, password } = req.body;

    try {

        let user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({
                errors: [{ msg: 'Invalid Credentials...' }]
            })
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({
                errors: [{ msg: 'Invalid Credentials...' }]
            })
        }

        const payload = {
            user: {
                id: user.id
            }
        }

        jwt.sign(payload, config.get('jwtSecret'), { expiresIn: 3600 }, (error, token) => { 
            
            if (error) throw error;
            
            res.json({ token })
        })

    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
})

// routes with /api/user

app.post('/api/user', [
    
    check('name', 'Name is Required').not().isEmpty(),
    check('email', 'Please enter a valid email...').isEmail(),
    check('password', 'Please enter a password with 6 or more characters...').isLength({ min: 6 })
    
    ] , async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        })
    }

    const { name, email, password } = req.body;

    try {

        let user = await User.findOne({ email });

        if (user) {
            return res.status(400).json({
                errors: [{ msg: 'User already exists...' }]
            })
        }

        const avatar = gravatar.url(email, {
            s: '200',
            r: "pg",
            d: "mm"
        })

        user = new User({
            name,
            email,
            password,
            avatar
        })

        const salt = await bcrypt.genSalt(10);

        user.password = await bcrypt.hash(password, salt);

        await user.save();

        const payload = {
            user: {
                id: user.id
            }
        }

        jwt.sign(payload, config.get('jwtSecret'), { expiresIn: 3600 }, (error, token) => { 
            
            if (error) throw error;
            
            res.json({ token })
        })

    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
})

// routes with /api/profile

app.get('/api/profile', async (req, res) => {
    try {
        const profiles = await Profile.find().populate("user", ["name", "avatar"]);
        res.json(profiles);
    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
})

app.get('/api/profile/user/:id', async (req, res) => {
    try {
        const profile = await Profile.findOne({ user: req.params.id }).populate("user", ["name", "avatar"]);

        if (!profile) {
            return res.status(400).json({
                errors: [{ msg: 'There is no profile for this user...' }]
            })
        }
    
        res.json(profile);
    } catch (error) {

        if (error.name == "CastError") {
            return res.status(400).json({
                errors: [{ msg: 'There is no profile for this user...' }]
            })
        }

        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
})

app.get('/api/profile/me', checkAuth, async (req, res) => {
    try {

        const profile = await Profile.findOne({ user: req.user.id }).populate('user', ['name', 'avatar']);

        if (!profile) {
            return res.status(400).json({
                errors: [{ msg: 'There is no profile for this user...' }]
            })
        }

        res.json(profile);

    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
})

app.post('/api/profile', [ checkAuth, [

    check('status', 'Status is Required').not().isEmpty(),
    check('skills', 'Skills is Required').not().isEmpty(),

]], async (req, res) => {
    
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        })
    }

    const {
        company, 
        website,
        location,
        bio,
        status,
        githubusername,
        skills,
        youtube,
        facebook,
        twitter,
        linkden,
        indeed,
        instagram
    } = req.body;

    const profile = {};

    profile.user = req.user.id;
    if (company) profile.company = company;
    if (website) profile.website = website;
    if (location) profile.location = location;
    if (bio) profile.bio = bio;
    if (status) profile.status = status;
    if (githubusername) profile.githubusername = githubusername;
    if (skills) {
        profile.skills = skills.split(',').map(skill => skill.trim());
    }

    profile.social = {};

    if (youtube) profile.social.youtube = youtube;
    if (facebook) profile.social.facebook = facebook;
    if (twitter) profile.social.twitter = twitter;
    if (linkden) profile.social.linkden = linkden;
    if (indeed) profile.social.indeed = indeed;
    if (instagram) profile.social.instagram = instagram;

    try {

        let existingProfile = await Profile.findOne({ user: req.user.id });

        if (existingProfile) {
            existingProfile = await Profile.findOneAndUpdate({ user: req.user.id }, { $set: profile }, { new: true}); 
            return res.json(existingProfile);
        }

        existingProfile = new Profile(profile);

        await existingProfile.save();

        res.json(existingProfile);

    } catch (error) {

        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })

    }

})

app.delete('/api/profile', checkAuth, async (req, res) => {
    try {
        await Profile.findOneAndRemove({ user: req.user.id });
        await User.findOneAndRemove({ _id: req.user.id });

        res.json({ msg: 'User Deleted...' });
    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
})

app.put('/api/profile/experience', [ checkAuth , [
    check('title', 'Title is required').not().isEmpty(),
    check('company', 'Company Name is required').not().isEmpty(),
    check('from', 'From date is required').not().isEmpty(),
]], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        })
    }

    const { title, company, location, from, to, current, description } = req.body;

    const newExp =  {
        title,
        company,
        location,
        from,
        to,
        current,
        description
    }

    try {
        const profile = await Profile.findOne({ user: req.user.id })

        profile.experience.unshift(newExp);

        await profile.save();

        res.json(profile);
    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
});

app.delete('/api/profile/experience/:exp_id', checkAuth, async (req, res) => {
    try {
        const profile = await Profile.findOne({ user: req.user.id })

        const removeIndex = profile.experience.map(item => item.id).indexOf(req.params.exp_id);

        profile.experience.splice(removeIndex, 1);

        await profile.save();

        res.json(profile);

    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
})

app.put('/api/profile/education', [ checkAuth , [
    check('school', 'School is required').not().isEmpty(),
    check('degree', 'Degree is required').not().isEmpty(),
    check('fieldofstudy', 'Field of study is required').not().isEmpty(),
    check('from', 'From date is required').not().isEmpty(),
]], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        })
    }

    const { school, degree, fieldofstudy, from, to, current, description } = req.body;

    const newEdu =  {
        school,
        degree,
        fieldofstudy,
        from,
        to,
        current,
        description
    }

    try {
        const profile = await Profile.findOne({ user: req.user.id })

        profile.education.unshift(newEdu);

        await profile.save();

        res.json(profile);
    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
});

app.delete('/api/profile/education/:edu_id', checkAuth, async (req, res) => {
    try {
        const profile = await Profile.findOne({ user: req.user.id })

        const removeIndex = profile.education.map(item => item.id).indexOf(req.params.edu_id);

        profile.education.splice(removeIndex, 1);

        await profile.save();

        res.json(profile);

    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
})

app.get("/api/profile/github/:username", async (req, res) => {
    try {
        const options = {
            uri: "https://api.github.com/users/" + req.params.username + "/repos?per_page=5&sort=created:asc&client_id=" + config.githubClientId + "&client_secret=" + config.githubClientSecret,
            method: 'GET',
            headers: { 'user-agent' : 'node.js' }
        }

        request(options, (error, response, body) => {
            if (error) {
                console.log(error)
            }

            if (response.statusCode !== 200) {
                return res.status(404).json({
                    errors: [{ msg: 'No github profile found...'}]
                })
            }

            res.json(JSON.parse(body));
        })
    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
})

// routes with /api/posts

app.get('/api/posts', checkAuth, async (req, res) => {

    try {
        const posts = await Post.find().sort({ date: -1 });
        res.json(posts);
    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }

});

app.get('/api/posts/:id', checkAuth, async (req, res) => {

    try {
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({
                errors: [{ msg: 'Post not found...'}]
            })
        }

        res.json(post);
    } catch (error) {

        if (error.name == "CastError") {
            return res.status(400).json({
                errors: [{ msg: 'Post not found...' }]
            })
        }

        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }

});

app.post('/api/posts', [checkAuth, [

    check('text', 'Text is required').not().isEmpty(),

]], async (req, res) => {

    const errors = validationResult(req);

    if (!error.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        })
    }

    try {
        const user = await User.findById(req.user.id).select('-password');

        const newPost = new Post({
            text: req.body.text,
            name: user.name,
            avatar: user.avatar,
            user: req.user.id
        })

        const post = await newPost.save();

        res.json(post);
    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }

});

app.put('/api/posts/like/:id', checkAuth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (post.likes.filter(like => like.user.toString === req.user.id).length > 0) {
            return res.status(400).json({ msg: 'Post already liked...'});
        }

        post.likes.unshift({ user: req.user.id });

        await post.save();

        res.json(post.likes);
    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
})

app.put('/api/posts/unlike/:id', checkAuth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (post.likes.filter(like => like.user.toString === req.user.id).length === 0) {
            return res.status(400).json({ msg: 'Post has not yet liked...'});
        }

        const removeIndex = post.likes.map(like => like.user.toString()).indexOf(req.user.id);

        post.like.splice(removeIndex, 1);

        await post.save();

        res.json(post.likes);
    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
})

app.delete('/api/posts/:id', checkAuth, async (req, res) => {

    try {
        const post = await Post.findById(req.params.id);

        if (post.user.toString() !== req.user.id) {
            return res.status(401).json({
                errors: [{ msg: 'User not authorized...'}]
            })
        }
        
        if (!post) {
            return res.status(404).json({
                errors: [{ msg: 'Post not found...'}]
            })
        }

        await post.remove();

        res.json({ msg: 'Post deleted'});
    } catch (error) {

        if (error.name == "CastError") {
            return res.status(400).json({
                errors: [{ msg: 'Post not found...' }]
            })
        }

        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }

});

// api to post comments

app.post('/api/posts/comment/:id', [checkAuth, [

    check('text', 'Text is required').not().isEmpty(),

]], async (req, res) => {

    const errors = validationResult(req);

    if (!error.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        })
    }

    try {
        const user = await User.findById(req.user.id).select('-password');

        const post = await Post.findById(req.params.id);

        const newComment = new Post({
            text: req.body.text,
            name: user.name,
            avatar: user.avatar,
            user: req.user.id
        })

        post.comments.unshift(newComment);

        await post.save();

        res.json(post.comments);
    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }

});

// api to delete comment

app.delete('/api/posts/comment/:id/comment_id', checkAuth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        const comment = post.comments.find(comment => comment.id === req.params.comment_id);

        if (!comment) {
            return res.status(404).json({
                errors: [{ msg: 'Comment does not exists...' }]
            })
        }

        if (comment.user.toString() !== req.user.id) {
            return res.status(401).json({
                errors: [{ msg: 'User not authorized...' }]
            })
        }

        const removeIndex = post.comments.map(comment => comment.user.toString()).indexOf(req.user.id);

        post.comments.splice(removeIndex, 1);

        await post.save();

        res.json(post.comments);

    } catch (error) {
        res.status(500).json({
            errors: [{ msg: 'Server error : ' + error }]
        })
    }
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log('\nServer Successfully Started @ ' + PORT));