
const uuid = require('uuid');
const ms = require('ms');

const CONF = require('./../conf');
const CONSTANTS = require('./../constants');

const AccountsDAO = require('./../dao/accounts');
const TokensDAO = require('./../dao/tokens');

module.exports = {

    _getNewExpireAt: (lifespan) => {
        if (parseInt(lifespan, 10) !== -1) {
            return { expireAt: new Date(new Date().getTime() + ms(lifespan)) };
        }

        return {};
    },

    sign: async (account, opts = {}) => {

        // opts.lifespan = opts.lifespan || CONF.jwt.expiresIn;

        let tokenExpireAt = {

        };

        // set expire to default
        if (opts.lifespan !== -1) {
            tokenExpireAt = module.exports._getNewExpireAt(opts.lifespan || CONF.jwt.expiresIn);
        }

        const query = {
            initiator: account._id,
            type: opts.type || CONSTANTS.TOKEN_TYPES.SELF,
        };

        // Search for an existing token --> findOneAndUpdate?
        const existingToken = !opts.new && await TokensDAO.findOne(query).lean();

        if (existingToken) {
            await TokensDAO.update({
                id: existingToken._id,
                props: module.exports._getNewExpireAt(opts.lifespan || existingToken.tokenLifeSpan),
            });
            return existingToken.tokenId;
        }

        const tokenId = uuid.v4();
        await TokensDAO.create({
            ...query,
            tokenId,
            tokenLifeSpan: opts.lifespan || CONF.jwt.expiresIn,
            ...tokenExpireAt,
        });

        return tokenId;
    },

    fetchAndProlongToken: async (token) => {

        const existingToken = await TokensDAO.findOne({
            tokenId: token,
        }).lean();

        if (existingToken) {
            await TokensDAO.update({
                id: existingToken._id,
                props: module.exports._getNewExpireAt(existingToken.tokenLifeSpan),
            });
            return existingToken;
        }

        return null;
    },

    verify: async (token, opts = {}) => {

        const existingToken = await module.exports.fetchAndProlongToken(token);

        return !!existingToken;

    },

    getAccountData: async (token, opts = {}) => {

        const existingToken = await module.exports.fetchAndProlongToken(token);

        if (!existingToken) {
            return null;
        }

        const AccountData = await AccountsDAO.findOne({
            _id: existingToken.initiator,
        });

        if (!AccountData || AccountData.status !== CONSTANTS.STATUS.ACTIVE) {
            return null;
        }

        AccountData.permissions = AccountData.permissions
            .concat(existingToken.permissions);

        return AccountData;

    },

};
