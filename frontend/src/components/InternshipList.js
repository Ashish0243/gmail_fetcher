// src/components/InternshipList.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const InternshipList = () => {
    const [internships, setInternships] = useState([]);

    useEffect(() => {
        const fetchInternships = async () => {
            try {
                const response = await axios.get('/api/internships');
                setInternships(response.data);
            } catch (error) {
                console.error("Error fetching internships", error);
            }
        };

        fetchInternships();
    }, []);

    return (
        <div>
            <h2>Internship Opportunities</h2>
            <ul>
                {internships.map((internship, index) => (
                    <li key={index}>
                        <h3>{internship.subject}</h3>
                        <p>{internship.snippet}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default InternshipList;
