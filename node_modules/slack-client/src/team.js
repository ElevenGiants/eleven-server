var Team;

Team = (function() {
  function Team(_client, id, name, domain) {
    this._client = _client;
    this.id = id;
    this.name = name;
    this.domain = domain;
  }

  return Team;

})();

module.exports = Team;
