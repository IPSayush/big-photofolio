/**
 * User Model — photographers and admins.
 * FR-AUTH-001/002/003: registration, login, role-based access.
 * 
 * Guests are NOT in this collection (DEC-003, OD-1).
 * tenant_id is nullable for platform admins who aren't tied to a specific tenant.
 * 
 * SEC-001/SEC-002: tenant_id enforced via tenantScope middleware for
 * all non-admin queries.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, AUTHENTICABLE_ROLES, USER_STATUS } = require('@photofolio/shared');

const userSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null, // null for platform admins
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Never return password by default
    },
    role: {
      type: String,
      enum: AUTHENTICABLE_ROLES,
      default: ROLES.PHOTOGRAPHER,
      index: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: 100,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: 100,
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.PENDING_VERIFICATION,
      index: true,
    },
    // FR-AUTH-002: email verification
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
    // FR-AUTH-002: password reset
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    // FR-AUTH-005: refresh token tracking
    refreshTokenHash: {
      type: String,
      select: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.password;
        delete ret.refreshTokenHash;
        delete ret.emailVerificationToken;
        delete ret.passwordResetToken;
        return ret;
      },
    },
  }
);

// Compound index for tenant-scoped user lookups
userSchema.index({ tenantId: 1, role: 1 });

/**
 * Hash password before saving.
 * Only re-hashes if the password field was modified.
 */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/**
 * Compare a candidate password against the stored hash.
 * @param {string} candidatePassword - The plaintext password to check.
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Get the user's full name.
 */
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('User', userSchema);
