/**
 * Helper to calculate effective status of a class based on current date
 * Adjusted for Vietnam Timezone (GMT+7)
 */
export const getEffectiveClassStatus = (cls) => {
    if (!cls) return null;
    
    // 1. If status is already "cancelled" or "closed" manually, respect it
    if (cls.status === "cancelled" || cls.status === "closed") {
        return cls.status;
    }
    
    // Get current date in Asia/Ho_Chi_Minh (Vietnam)
    const todayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());

    const startDate = cls.startDate || cls.start_date; 
    const endDate = cls.endDate || cls.end_date;

    // 2. Auto-close if end date passed (even if DB says active/upcoming)
    if (endDate && endDate < todayStr) {
        return "closed";
    }
    
    // 3. Auto-activate if start date reached and it was upcoming
    if (startDate && startDate <= todayStr) {
        if (cls.status === "upcoming") return "active";
    }

    // 4. Default to current database status (respects manual 'active' even if startDate > today)
    return cls.status;
};
