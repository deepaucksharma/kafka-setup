const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { logger } = require('./logger');

class ProgressManager extends EventEmitter {
  constructor({ filePath, checkpointInterval = 60000 }) {
    super();
    
    this.filePath = filePath;
    this.checkpointInterval = checkpointInterval;
    this.autoSaveTimer = null;
    this.lastSave = Date.now();
    this.isDirty = false;
  }
  
  async load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        const progress = JSON.parse(data);
        
        // Check if progress is recent enough to resume
        const age = Date.now() - (progress.timestamp || 0);
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (age < maxAge) {
          logger.info('Loaded previous progress', {
            age: Math.round(age / 1000 / 60) + ' minutes',
            eventTypes: progress.discoveries?.eventTypes?.length || 0,
            queries: progress.statistics?.queriesExecuted || 0
          });
          
          return progress;
        } else {
          logger.info('Previous progress too old, starting fresh', {
            age: Math.round(age / 1000 / 60 / 60) + ' hours'
          });
        }
      }
    } catch (error) {
      logger.error('Failed to load progress', error);
    }
    
    return null;
  }
  
  async save(state) {
    try {
      const progress = {
        ...state,
        timestamp: Date.now(),
        version: '1.0.0'
      };
      
      // Create backup of existing file
      if (fs.existsSync(this.filePath)) {
        const backupPath = this.filePath.replace('.json', `.backup-${Date.now()}.json`);
        fs.copyFileSync(this.filePath, backupPath);
        
        // Keep only last 3 backups
        this.cleanupBackups();
      }
      
      // Write atomically
      const tempPath = this.filePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(progress, null, 2));
      fs.renameSync(tempPath, this.filePath);
      
      this.lastSave = Date.now();
      this.isDirty = false;
      
      this.emit('saved', {
        path: this.filePath,
        size: fs.statSync(this.filePath).size,
        eventTypes: progress.discoveries?.eventTypes?.length || 0
      });
      
    } catch (error) {
      logger.error('Failed to save progress', error);
      throw error;
    }
  }
  
  startAutoSave(state) {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setInterval(async () => {
      if (this.isDirty || (Date.now() - this.lastSave) > this.checkpointInterval) {
        try {
          await this.save(state);
          this.emit('checkpoint', state);
        } catch (error) {
          logger.error('Auto-save failed', error);
        }
      }
    }, Math.min(this.checkpointInterval, 30000)); // Check at least every 30 seconds
    
    // Mark as dirty when state changes
    const markDirty = () => {
      this.isDirty = true;
    };
    
    // Watch for state changes (simplified)
    if (state.discoveries) {
      ['eventTypes', 'metrics', 'queries', 'insights'].forEach(key => {
        if (Array.isArray(state.discoveries[key])) {
          const original = state.discoveries[key];
          Object.defineProperty(state.discoveries, key, {
            get: () => original,
            set: (value) => {
              markDirty();
              return value;
            }
          });
        }
      });
    }
  }
  
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }
  
  cleanupBackups() {
    try {
      const dir = path.dirname(this.filePath);
      const baseName = path.basename(this.filePath, '.json');
      
      const backupFiles = fs.readdirSync(dir)
        .filter(file => file.startsWith(`${baseName}.backup-`))
        .map(file => ({
          name: file,
          path: path.join(dir, file),
          time: parseInt(file.match(/backup-(\d+)/)[1])
        }))
        .sort((a, b) => b.time - a.time);
      
      // Keep only the 3 most recent backups
      backupFiles.slice(3).forEach(backup => {
        fs.unlinkSync(backup.path);
        logger.debug('Deleted old backup', { file: backup.name });
      });
      
    } catch (error) {
      logger.debug('Failed to cleanup backups', error);
    }
  }
  
  async createSnapshot(state, name) {
    try {
      const snapshotDir = path.join(path.dirname(this.filePath), 'snapshots');
      fs.mkdirSync(snapshotDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotPath = path.join(snapshotDir, `${name}-${timestamp}.json`);
      
      const snapshot = {
        ...state,
        timestamp: Date.now(),
        name,
        version: '1.0.0'
      };
      
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
      
      logger.info('Created snapshot', { name, path: snapshotPath });
      
      return snapshotPath;
      
    } catch (error) {
      logger.error('Failed to create snapshot', error);
      throw error;
    }
  }
  
  async listSnapshots() {
    try {
      const snapshotDir = path.join(path.dirname(this.filePath), 'snapshots');
      
      if (!fs.existsSync(snapshotDir)) {
        return [];
      }
      
      const snapshots = fs.readdirSync(snapshotDir)
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const filePath = path.join(snapshotDir, file);
          const stats = fs.statSync(filePath);
          
          try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return {
              name: data.name || file,
              path: filePath,
              timestamp: data.timestamp || stats.mtime.getTime(),
              size: stats.size,
              eventTypes: data.discoveries?.eventTypes?.length || 0,
              queries: data.statistics?.queriesExecuted || 0
            };
          } catch (error) {
            return null;
          }
        })
        .filter(s => s !== null)
        .sort((a, b) => b.timestamp - a.timestamp);
      
      return snapshots;
      
    } catch (error) {
      logger.error('Failed to list snapshots', error);
      return [];
    }
  }
  
  async loadSnapshot(snapshotPath) {
    try {
      const data = fs.readFileSync(snapshotPath, 'utf8');
      const snapshot = JSON.parse(data);
      
      logger.info('Loaded snapshot', {
        name: snapshot.name,
        eventTypes: snapshot.discoveries?.eventTypes?.length || 0,
        age: Math.round((Date.now() - snapshot.timestamp) / 1000 / 60) + ' minutes'
      });
      
      return snapshot;
      
    } catch (error) {
      logger.error('Failed to load snapshot', error);
      throw error;
    }
  }
  
  getProgress(state) {
    if (!state || !state.discoveries) {
      return { percentage: 0, message: 'Not started' };
    }
    
    const eventTypesProcessed = state.discoveries.eventTypes.length;
    const metricsProcessed = state.discoveries.metrics.length;
    const queriesGenerated = state.discoveries.queries.length;
    
    // Rough estimation of progress
    let progress = 0;
    let message = '';
    
    if (state.status === 'completed') {
      progress = 100;
      message = 'Discovery completed';
    } else if (state.status === 'failed') {
      progress = 0;
      message = 'Discovery failed';
    } else {
      // Estimate based on typical discovery phases
      if (eventTypesProcessed > 0) {
        progress += 40; // Event type discovery
        message = `Processing event types (${eventTypesProcessed} done)`;
      }
      if (metricsProcessed > 0) {
        progress += 20; // Metric discovery
        message = `Discovering metrics (${metricsProcessed} groups)`;
      }
      if (queriesGenerated > 0) {
        progress += 20; // Query generation
        message = `Generating queries (${queriesGenerated} created)`;
      }
      if (state.discoveries.insights && state.discoveries.insights.length > 0) {
        progress += 10; // Analysis
        message = 'Analyzing data and generating insights';
      }
      if (state.discoveries.dashboard) {
        progress += 10; // Dashboard creation
        message = 'Creating dashboard';
      }
    }
    
    return {
      percentage: Math.min(100, progress),
      message,
      details: {
        eventTypes: eventTypesProcessed,
        metrics: metricsProcessed,
        queries: queriesGenerated,
        duration: state.startTime ? Date.now() - state.startTime : 0
      }
    };
  }
}

module.exports = ProgressManager;