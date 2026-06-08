/**
 * Centralized constants for HTTP status codes and response messages.
 */

const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500
};

const MESSAGES = {
    // Auth Messages
    LOGIN_SUCCESS: "Login successful.",
    LOGOUT_SUCCESS: "Logged out successfully.",
    SIGNUP_SUCCESS: "Account created successfully.",
    UNAUTHORIZED: "Unauthorized access. Please login.",
    FORBIDDEN: "Forbidden. You do not have permission.",
    INVALID_CREDENTIALS: "Invalid email or password.",
    INTERNAL_SERVER_ERROR: "An unexpected error occurred. Please try again later.",
    INVALID_REFERRAL_CODE: "Referral code can only contain letters and numbers.",
    GOOGLE_AUTH_REQUIRED: "Account registered with Google. Use Google login.",
    GOOGLE_LOGIN_REQUIRED: "This account uses Google login. Please continue with Google or set a password.",
    PROFILE_CREATE_ERROR: "System encountered an error creating your profile.",
    SESSION_EXPIRED: "Session expired. Please log in again.",

    // Additional Auth Messages
    REQUIRED_FIELDS_MISSING: "Required fields are missing.",
    EMAIL_REQUIRED: "Email is required.",
    PASSWORD_REQUIRED: "Password is required.",
    INVALID_NAME_FORMAT: "First name can only contain letters and numbers, minimum 3 chars.",
    INVALID_LAST_NAME_FORMAT: "Last name can only contain letters and numbers, minimum 3 chars.",
    INVALID_EMAIL_FORMAT: "Please enter a valid email address.",
    INVALID_PASSWORD_FORMAT: "Password must contain uppercase, lowercase, number and symbol (min 8 chars).",
    PASSWORDS_NOT_MATCH: "Passwords do not match.",
    EMAIL_ALREADY_EXISTS: "An account with this email already exists.",
    FIRST_NAME_TAKEN: "First name is already taken. Please choose another.",
    OTP_SENT_SUCCESS: "OTP sent successfully",
    SIGNUP_FAILED: "Signup failed due to server error.",
    INVALID_OTP: "Invalid or expired OTP",
    SIGNUP_SESSION_EXPIRED: "Signup session expired or invalid",
    EMAIL_CHANGE_SESSION_EXPIRED: "Email change session expired or invalid",
    EMAIL_TAKEN: "This email has been taken by another account. Please try a different email.",
    UNKNOWN_OTP_TYPE: "Unknown OTP verification type",
    VERIFICATION_FAILED: "Verification failed due to server error.",
    EMAIL_REQUIRED: "Email required",
    OTP_RESEND_SUCCESS: "OTP resent successfully",
    OTP_RESEND_FAILED: "Failed to resend OTP",
    ACCOUNT_SUSPENDED: "Your account has been suspended. Please contact support.",
    INTERNAL_LOGIN_ERROR: "Internal server error during login",
    EMAIL_NOT_FOUND: "No account found with that email.",
    PASSWORD_RESET_SENT: "A password reset link has been sent to your email.",
    PASSWORD_RESET_LINK_FAILED: "Failed to send password reset link. Please try again later.",
    INVALID_TOKEN: "Invalid or missing token.",
    TOKEN_EXPIRED: "Password reset token is invalid or has expired.",
    PASSWORD_COMPLEXITY_ERROR: "Password does not meet complexity requirements.",
    PASSWORD_RESET_SUCCESS: "Your password has been successfully reset! You may now login.",
    PASSWORD_RESET_FAILED: "Failed to reset password.",

    // User/Address Messages
    ADDRESS_ADDED: "Address added successfully.",
    ADDRESS_UPDATED: "Address updated successfully.",
    ADDRESS_DELETED: "Address deleted successfully.",
    ADDRESS_NOT_FOUND: "Address not found.",
    PROFILE_UPDATED: "Profile updated successfully.",
    OLD_PASSWORD_REQUIRED: "Old password is required.",
    OLD_PASSWORD_INCORRECT: "Old password is incorrect.",
    NEW_PASSWORD_COMPLEXITY: "New password must contain uppercase, lowercase, number and symbol.",
    PASSWORD_UPDATED: "Password updated successfully.",
    HOME_PAGE_LOAD_FAILED: "Failed to load home page.",
    SESSION_SAVE_ERROR: "Failed to save session. Please try again.",
    OTP_SERVICE_MISSING: "System error: OTP service is missing. Please contact support.",

    // Admin Messages
    ADMIN_LOGIN_SUCCESS: "Admin authenticated successfully.",
    ADMIN_LOGIN_ERROR: "Invalid admin credentials.",
    ADMIN_ONLY: "This portal is reserved for administrators only.",
    ADMIN_VIA_USER_PORTAL: "Admin accounts must use the admin login portal.",
    USER_BLOCKED: "User has been blocked successfully.",
    USER_UNBLOCKED: "User has been unblocked successfully.",
    USER_NOT_FOUND: "User not found.",
    USERS_LOAD_FAILED: "Unable to load users.",
    TOGGLE_BLOCK_ERROR: "Server error toggling block status.",

    // Generic
    VALIDATION_ERROR: "Validation error",
    INVALID_ID_FORMAT: "Invalid ID format",
    INVALID_JWT_TOKEN: "Invalid token",
    NOT_FOUND: "Resource not found."
};

module.exports = {
    HTTP_STATUS,
    MESSAGES
};
