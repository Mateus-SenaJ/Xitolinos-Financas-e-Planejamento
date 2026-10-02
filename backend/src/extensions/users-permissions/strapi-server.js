'use strict';
module.exports = plugin => {
  plugin.contentTypes.user.schema.attributes.profile = {
    type: 'enumeration', enum: ['owner', 'viewer'], default: 'owner', required: true
  };
  return plugin;
};
