/**
 * Watchdog System - Exports
 * 
 * Health monitoring system for agents with Witness, Deacon, and Dog components.
 * Follows the ROADMAP-v2.md health status system: healthy → degraded → stalled → dead
 */

// Witness - Health monitor for agents
export { Witness, createWitness } from './witness.js';
export type { WitnessConfigOptions } from './witness.js';

// Deacon - Background supervisor for managing Witnesses
export { Deacon, createDeacon } from './deacon.js';
export type { PatrolCallback, DogDispatchCallback, HealthChangeCallback } from './deacon.js';

// Types - re-export from watchdog-types
export type { 
  HealthStatus,
  WitnessId,
  DeaconId,
  DogId,
  WitnessReport,
  WitnessConfig,
  DeaconReport,
  DeaconConfig,
  DogTask,
  DogConfig,
  PatrolCycle,
} from './watchdog-types.js';

// Utility functions from watchdog-types
export { 
  generateWitnessId,
  generateDeaconId,
  generateDogId,
  isValidWitnessId,
  isValidDeaconId,
  isValidDogId,
  calculateHealthStatus,
  createWitnessConfig,
  createDeaconConfig,
  createDogConfig,
  createDogTask,
} from './watchdog-types.js';