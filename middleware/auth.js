const jwt = require('jsonwebtoken');

const config = require('config');

module.exports = function (req, res, next) {

    const token = req.header('x-auth-token');

    if (!token) {
        return res.status(401).json({ msg: 'No Token, Authorization Denied !!!'})
    }

    try {

        const decodedToken = jwt.verify(token, config.get('jwtSecret'));

        req.user = decodedToken.user;

        next();

    } catch(error) {

        res.status(401).json({ msg: 'Token is Expired or Not Valid' })

    }

}