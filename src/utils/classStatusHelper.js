/**
 * Helper to calculate effective status of a class based on current date
 * Adjusted for Vietnam Timezone (GMT+7)
 */
export const getEffectiveClassStatus = (cls) => {
    if (!cls) return null;
    if (cls.status === "cancelled") return "cancelled";
    
    // Get current date in Asia/Ho_Chi_Minh (Vietnam)
    const todayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());

    const startDate = cls.startDate || cls.start_date; // Handle different property naming
    const endDate = cls.endDate || cls.end_date;

    // 1. Check if closed
    if (endDate && endDate < todayStr) {
        return "closed";
    }
    
    // 2. Check if active (started)
    if (startDate && startDate <= todayStr) {
        // Only override if it was upcoming
        if (cls.status === "upcoming") return "active";
        return cls.status;
    }

    // 3. Otherwise (future start date)
    if (startDate && startDate > todayStr) {
        return "upcoming";
    }

    return cls.status;
};
