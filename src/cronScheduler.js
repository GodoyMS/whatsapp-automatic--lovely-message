const cron = require('node-cron');
const logger = require('./logger');

class CronScheduler {
    constructor() {
        this.jobs = new Map();
        this.isRunning = false;
    }

    // Schedule automatic message sending every X seconds
    scheduleAutoMessages(intervalSeconds, callback, options = {}) {
        try {
            // Convert seconds to cron expression
            const cronExpression = this.secondsToCronExpression(intervalSeconds);
            
            logger.info(`Scheduling automatic messages every ${intervalSeconds} seconds with cron: ${cronExpression}`);

            const job = cron.schedule(cronExpression, async () => {
                try {
                    logger.info('Executing scheduled message task...');
                    await callback();
                } catch (error) {
                    logger.error('Error in scheduled message task:', error);
                }
            }, {
                scheduled: false,
                timezone: options.timezone || 'America/New_York'
            });

            this.jobs.set('autoMessages', job);
            return job;
        } catch (error) {
            logger.error('Failed to schedule auto messages:', error);
            throw error;
        }
    }

    // Schedule daily conversation history sync
    scheduleHistorySync(callback, hour = 2) {
        try {
            // Run daily at specified hour (default 2 AM)
            const cronExpression = `0 ${hour} * * *`;
            
            logger.info(`Scheduling daily history sync at ${hour}:00 with cron: ${cronExpression}`);

            const job = cron.schedule(cronExpression, async () => {
                try {
                    logger.info('Executing scheduled history sync...');
                    await callback();
                } catch (error) {
                    logger.error('Error in scheduled history sync:', error);
                }
            }, {
                scheduled: false
            });

            this.jobs.set('historySync', job);
            return job;
        } catch (error) {
            logger.error('Failed to schedule history sync:', error);
            throw error;
        }
    }

    // Schedule session health check
    scheduleHealthCheck(callback, intervalMinutes = 30) {
        try {
            const cronExpression = `*/${intervalMinutes} * * * *`;
            
            logger.info(`Scheduling health check every ${intervalMinutes} minutes with cron: ${cronExpression}`);

            const job = cron.schedule(cronExpression, async () => {
                try {
                    await callback();
                } catch (error) {
                    logger.error('Error in scheduled health check:', error);
                }
            }, {
                scheduled: false
            });

            this.jobs.set('healthCheck', job);
            return job;
        } catch (error) {
            logger.error('Failed to schedule health check:', error);
            throw error;
        }
    }

    // Schedule custom task
    scheduleCustomTask(name, cronExpression, callback, options = {}) {
        try {
            logger.info(`Scheduling custom task '${name}' with cron: ${cronExpression}`);

            const job = cron.schedule(cronExpression, async () => {
                try {
                    logger.debug(`Executing custom task: ${name}`);
                    await callback();
                } catch (error) {
                    logger.error(`Error in custom task '${name}':`, error);
                }
            }, {
                scheduled: false,
                ...options
            });

            this.jobs.set(name, job);
            return job;
        } catch (error) {
            logger.error(`Failed to schedule custom task '${name}':`, error);
            throw error;
        }
    }

    // Start all scheduled jobs
    startAll() {
        try {
            this.jobs.forEach((job, name) => {
                job.start();
                logger.info(`Started scheduled job: ${name}`);
            });
            this.isRunning = true;
            logger.info('All scheduled jobs started successfully');
        } catch (error) {
            logger.error('Failed to start scheduled jobs:', error);
            throw error;
        }
    }

    // Stop all scheduled jobs
    stopAll() {
        try {
            this.jobs.forEach((job, name) => {
                job.stop();
                logger.info(`Stopped scheduled job: ${name}`);
            });
            this.isRunning = false;
            logger.info('All scheduled jobs stopped');
        } catch (error) {
            logger.error('Failed to stop scheduled jobs:', error);
        }
    }

    // Start specific job
    startJob(name) {
        try {
            const job = this.jobs.get(name);
            if (job) {
                job.start();
                logger.info(`Started job: ${name}`);
                return true;
            } else {
                logger.warn(`Job '${name}' not found`);
                return false;
            }
        } catch (error) {
            logger.error(`Failed to start job '${name}':`, error);
            return false;
        }
    }

    // Stop specific job
    stopJob(name) {
        try {
            const job = this.jobs.get(name);
            if (job) {
                job.stop();
                logger.info(`Stopped job: ${name}`);
                return true;
            } else {
                logger.warn(`Job '${name}' not found`);
                return false;
            }
        } catch (error) {
            logger.error(`Failed to stop job '${name}':`, error);
            return false;
        }
    }

    // Remove job
    removeJob(name) {
        try {
            const job = this.jobs.get(name);
            if (job) {
                job.stop();
                job.destroy();
                this.jobs.delete(name);
                logger.info(`Removed job: ${name}`);
                return true;
            } else {
                logger.warn(`Job '${name}' not found`);
                return false;
            }
        } catch (error) {
            logger.error(`Failed to remove job '${name}':`, error);
            return false;
        }
    }

    // Get job status
    getJobStatus(name) {
        const job = this.jobs.get(name);
        if (!job) {
            return null;
        }

        return {
            name,
            running: job.running || false,
            expression: job.expression || 'unknown'
        };
    }

    // Get all jobs status
    getAllJobsStatus() {
        const status = [];
        this.jobs.forEach((job, name) => {
            status.push(this.getJobStatus(name));
        });
        return status;
    }

    // Convert seconds to cron expression
    secondsToCronExpression(seconds) {
        if (seconds < 1) {
            throw new Error('Interval must be at least 1 second');
        }

        // For intervals less than 60 seconds, use seconds expression
        if (seconds < 60) {
            return `*/${seconds} * * * * *`; // Every X seconds
        }
        
        // For 60+ seconds, convert to minutes if possible
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (remainingSeconds === 0 && minutes < 60) {
            // Clean minute intervals
            return `0 */${minutes} * * * *`; // Every X minutes
        }
        
        if (seconds <= 3600) {
            // For intervals up to 1 hour, use seconds (but warn about performance)
            if (seconds > 300) { // 5 minutes
                logger.warn(`Large second interval (${seconds}s) may impact performance. Consider using minutes.`);
            }
            return `*/${seconds} * * * * *`;
        }
        
        // For very large intervals, convert to hours
        const hours = Math.floor(seconds / 3600);
        if (seconds % 3600 === 0) {
            return this.hoursToCronExpression(hours);
        }
        
        // Default to closest minute interval for non-standard large intervals
        const closestMinutes = Math.round(seconds / 60);
        logger.warn(`Non-standard interval ${seconds}s adjusted to ${closestMinutes} minutes`);
        return `0 */${closestMinutes} * * * *`;
    }

    // Convert hours to cron expression (kept for backward compatibility)
    hoursToCronExpression(hours) {
        if (hours < 1) {
            throw new Error('Interval must be at least 1 hour');
        }

        if (hours === 1) {
            return '0 * * * *'; // Every hour
        } else if (hours === 2) {
            return '0 */2 * * *'; // Every 2 hours
        } else if (hours === 3) {
            return '0 */3 * * *'; // Every 3 hours
        } else if (hours === 4) {
            return '0 */4 * * *'; // Every 4 hours
        } else if (hours === 6) {
            return '0 */6 * * *'; // Every 6 hours
        } else if (hours === 8) {
            return '0 */8 * * *'; // Every 8 hours
        } else if (hours === 12) {
            return '0 */12 * * *'; // Every 12 hours
        } else if (hours === 24) {
            return '0 0 * * *'; // Daily at midnight
        } else if (hours <= 24 && 24 % hours === 0) {
            return `0 */${hours} * * *`;
        } else {
            // For non-standard intervals, approximate with minutes
            const minutes = hours * 60;
            if (minutes < 60) {
                return `*/${Math.floor(minutes)} * * * *`;
            } else {
                // Default to closest standard interval
                const standardHours = [1, 2, 3, 4, 6, 8, 12, 24];
                const closest = standardHours.reduce((prev, curr) => 
                    Math.abs(curr - hours) < Math.abs(prev - hours) ? curr : prev
                );
                logger.warn(`Non-standard interval ${hours}h adjusted to ${closest}h`);
                return this.hoursToCronExpression(closest);
            }
        }
    }

    // Validate cron expression
    validateCronExpression(expression) {
        try {
            return cron.validate(expression);
        } catch (error) {
            return false;
        }
    }

    // Get next execution times
    getNextExecutions(name, count = 5) {
        const job = this.jobs.get(name);
        if (!job) {
            return [];
        }

        try {
            const executions = [];
            const now = new Date();
            let nextDate = now;

            for (let i = 0; i < count; i++) {
                // This is a simplified approach - actual implementation would depend on cron library capabilities
                nextDate = new Date(nextDate.getTime() + 60000); // Add 1 minute for approximation
                executions.push(nextDate.toISOString());
            }

            return executions;
        } catch (error) {
            logger.error(`Failed to get next executions for job '${name}':`, error);
            return [];
        }
    }

    // Shutdown all jobs gracefully
    async shutdown() {
        try {
            logger.info('Shutting down cron scheduler...');
            
            this.stopAll();
            
            // Clear all jobs
            this.jobs.forEach((job, name) => {
                job.destroy();
            });
            this.jobs.clear();
            
            logger.info('Cron scheduler shutdown complete');
        } catch (error) {
            logger.error('Error during cron scheduler shutdown:', error);
        }
    }

    // Get scheduler statistics
    getStats() {
        return {
            totalJobs: this.jobs.size,
            runningJobs: Array.from(this.jobs.values()).filter(job => job.running).length,
            isRunning: this.isRunning,
            jobs: this.getAllJobsStatus()
        };
    }
}

module.exports = CronScheduler;