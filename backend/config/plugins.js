'use strict';
module.exports = () => ({
  'users-permissions': {
    config: {
      jwtManagement: 'legacy-support',
      jwt: { expiresIn: '1d' },
      ratelimit: { enabled: true, interval: 60000, max: 10 },
      register: { allowedFields: ['profile'] },
      advanced: { allow_register: false, unique_email: true }
    }
  }
});
