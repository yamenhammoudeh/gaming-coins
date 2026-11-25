/* Oversikt over ruterdrivere. Hver driver har: test(), apply(devices), clients() */
const DRIVERS = {
  asus: require('./asus'),
  openwrt: require('./openwrt'),
  mikrotik: require('./mikrotik'),
  unifi: require('./unifi'),
  fritzbox: require('./fritzbox'),
  adguard: require('./adguard'),
  webhook: require('./webhook'),
};
function create(cfg) {
  const D = DRIVERS[cfg.driver];
  if (!D) throw new Error('Velg rutertype under Foreldre → Ruter');
  return new D(cfg);
}
module.exports = { DRIVERS, create };
